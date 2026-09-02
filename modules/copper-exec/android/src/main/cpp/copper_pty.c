#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <jni.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

/*
 * Copper Runtime's small PTY bridge. It creates a controlling pseudo-terminal
 * for an already installed Copper-prefix shell, then exposes only descriptor
 * reads/writes/resizes/signals to the Kotlin session manager. It is deliberately
 * generic: package management and filesystem authorization live above this
 * native layer.
 */

static void throw_exception(JNIEnv* env, const char* class_name, const char* message) {
    jclass exception_class = (*env)->FindClass(env, class_name);
    if (exception_class != NULL) (*env)->ThrowNew(env, exception_class, message);
}

static void throw_errno(JNIEnv* env, const char* operation) {
    char message[256];
    snprintf(message, sizeof(message), "%s failed: %s", operation, strerror(errno));
    throw_exception(env, "java/io/IOException", message);
}

static char** string_array(JNIEnv* env, jobjectArray values) {
    if (values == NULL) return NULL;
    jsize count = (*env)->GetArrayLength(env, values);
    char** output = calloc((size_t)count + 1, sizeof(char*));
    if (output == NULL) {
        throw_exception(env, "java/lang/OutOfMemoryError", "Could not allocate terminal arguments");
        return NULL;
    }

    for (jsize index = 0; index < count; index++) {
        jstring value = (jstring)(*env)->GetObjectArrayElement(env, values, index);
        if (value == NULL) {
            output[index] = strdup("");
        } else {
            const char* utf8 = (*env)->GetStringUTFChars(env, value, NULL);
            if (utf8 == NULL) {
                for (jsize previous = 0; previous < index; previous++) free(output[previous]);
                free(output);
                return NULL;
            }
            output[index] = strdup(utf8);
            (*env)->ReleaseStringUTFChars(env, value, utf8);
        }
        if (output[index] == NULL) {
            for (jsize previous = 0; previous < index; previous++) free(output[previous]);
            free(output);
            throw_exception(env, "java/lang/OutOfMemoryError", "Could not allocate terminal argument");
            return NULL;
        }
    }
    output[count] = NULL;
    return output;
}

static void free_string_array(char** values) {
    if (values == NULL) return;
    for (char** current = values; *current != NULL; current++) free(*current);
    free(values);
}

static void close_inherited_descriptors(void) {
    DIR* descriptors = opendir("/proc/self/fd");
    if (descriptors == NULL) return;
    int directory_fd = dirfd(descriptors);
    struct dirent* entry;
    while ((entry = readdir(descriptors)) != NULL) {
        char* end = NULL;
        long descriptor = strtol(entry->d_name, &end, 10);
        if (end == entry->d_name || *end != '\0') continue;
        if (descriptor > STDERR_FILENO && descriptor != directory_fd) close((int)descriptor);
    }
    closedir(descriptors);
}

JNIEXPORT jintArray JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeCreate(
        JNIEnv* env,
        jobject ignored_instance,
        jstring executable,
        jstring working_directory,
        jobjectArray arguments,
        jobjectArray environment,
        jint rows,
        jint columns) {
    (void)ignored_instance;
    if (executable == NULL || working_directory == NULL || arguments == NULL || (*env)->GetArrayLength(env, arguments) < 1 || rows < 1 || columns < 1) {
        throw_exception(env, "java/lang/IllegalArgumentException", "Terminal executable, arguments, working directory, rows, and columns are required");
        return NULL;
    }

    jintArray result = NULL;
    const char* executable_utf8 = (*env)->GetStringUTFChars(env, executable, NULL);
    const char* cwd_utf8 = (*env)->GetStringUTFChars(env, working_directory, NULL);
    if (executable_utf8 == NULL || cwd_utf8 == NULL) {
        if (executable_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, executable, executable_utf8);
        if (cwd_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, working_directory, cwd_utf8);
        return NULL;
    }

    char** argv = string_array(env, arguments);
    char** envp = string_array(env, environment);
    if ((*env)->ExceptionCheck(env)) {
        free_string_array(argv);
        free_string_array(envp);
        (*env)->ReleaseStringUTFChars(env, executable, executable_utf8);
        (*env)->ReleaseStringUTFChars(env, working_directory, cwd_utf8);
        return NULL;
    }

    int master = open("/dev/ptmx", O_RDWR | O_CLOEXEC);
    if (master < 0) {
        throw_errno(env, "open /dev/ptmx");
        goto cleanup;
    }

    char slave_name[128];
    if (grantpt(master) != 0 || unlockpt(master) != 0 || ptsname_r(master, slave_name, sizeof(slave_name)) != 0) {
        throw_errno(env, "initialize pseudo-terminal");
        close(master);
        goto cleanup;
    }

    struct termios attributes;
    if (tcgetattr(master, &attributes) == 0) {
#ifdef IUTF8
        attributes.c_iflag |= IUTF8;
#endif
        attributes.c_iflag &= (tcflag_t) ~(IXON | IXOFF);
        tcsetattr(master, TCSANOW, &attributes);
    }

    struct winsize size = {
        .ws_row = (unsigned short)rows,
        .ws_col = (unsigned short)columns,
        .ws_xpixel = 0,
        .ws_ypixel = 0,
    };
    if (ioctl(master, TIOCSWINSZ, &size) != 0) {
        throw_errno(env, "set pseudo-terminal size");
        close(master);
        goto cleanup;
    }

    pid_t pid = fork();
    if (pid < 0) {
        throw_errno(env, "fork terminal process");
        close(master);
        goto cleanup;
    }

    if (pid == 0) {
        sigset_t signals;
        sigfillset(&signals);
        sigprocmask(SIG_UNBLOCK, &signals, NULL);
        close(master);
        setsid();

        int slave = open(slave_name, O_RDWR);
        if (slave < 0) _exit(127);
        if (ioctl(slave, TIOCSCTTY, 0) != 0) _exit(127);
        dup2(slave, STDIN_FILENO);
        dup2(slave, STDOUT_FILENO);
        dup2(slave, STDERR_FILENO);
        if (slave > STDERR_FILENO) close(slave);
        close_inherited_descriptors();

        clearenv();
        if (envp != NULL) {
            for (char** item = envp; *item != NULL; item++) putenv(*item);
        }
        if (chdir(cwd_utf8) != 0) {
            dprintf(STDERR_FILENO, "copper-runtime: cannot enter %s: %s\r\n", cwd_utf8, strerror(errno));
            _exit(126);
        }
        execv(executable_utf8, argv);
        dprintf(STDERR_FILENO, "copper-runtime: cannot execute %s: %s\r\n", executable_utf8, strerror(errno));
        _exit(127);
    }

    jint values[2] = { master, (jint)pid };
    result = (*env)->NewIntArray(env, 2);
    if (result != NULL) (*env)->SetIntArrayRegion(env, result, 0, 2, values);

cleanup:
    free_string_array(argv);
    free_string_array(envp);
    (*env)->ReleaseStringUTFChars(env, executable, executable_utf8);
    (*env)->ReleaseStringUTFChars(env, working_directory, cwd_utf8);
    return result;
}

JNIEXPORT jint JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeRead(
        JNIEnv* env, jobject ignored_instance, jint descriptor, jbyteArray destination) {
    (void)ignored_instance;
    if (destination == NULL) {
        throw_exception(env, "java/lang/IllegalArgumentException", "Destination buffer is required");
        return -1;
    }
    jsize length = (*env)->GetArrayLength(env, destination);
    jbyte* bytes = (*env)->GetByteArrayElements(env, destination, NULL);
    if (bytes == NULL) return -1;
    ssize_t count;
    do {
        count = read(descriptor, bytes, (size_t)length);
    } while (count < 0 && errno == EINTR);
    (*env)->ReleaseByteArrayElements(env, destination, bytes, 0);
    if (count < 0) {
        if (errno == EIO) return -1; /* Normal PTY EOF after child exit. */
        throw_errno(env, "read terminal");
        return -1;
    }
    return (jint)count;
}

JNIEXPORT jint JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeWrite(
        JNIEnv* env, jobject ignored_instance, jint descriptor, jbyteArray source) {
    (void)ignored_instance;
    if (source == NULL) {
        throw_exception(env, "java/lang/IllegalArgumentException", "Source buffer is required");
        return -1;
    }
    jsize length = (*env)->GetArrayLength(env, source);
    jbyte* bytes = (*env)->GetByteArrayElements(env, source, NULL);
    if (bytes == NULL) return -1;
    size_t offset = 0;
    while (offset < (size_t)length) {
        ssize_t count = write(descriptor, bytes + offset, (size_t)length - offset);
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) {
            (*env)->ReleaseByteArrayElements(env, source, bytes, JNI_ABORT);
            throw_errno(env, "write terminal");
            return -1;
        }
        offset += (size_t)count;
    }
    (*env)->ReleaseByteArrayElements(env, source, bytes, JNI_ABORT);
    return (jint)offset;
}

JNIEXPORT void JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeResize(
        JNIEnv* env, jobject ignored_instance, jint descriptor, jint rows, jint columns) {
    (void)ignored_instance;
    if (rows < 1 || columns < 1) {
        throw_exception(env, "java/lang/IllegalArgumentException", "Terminal rows and columns must be positive");
        return;
    }
    struct winsize size = {
        .ws_row = (unsigned short)rows,
        .ws_col = (unsigned short)columns,
        .ws_xpixel = 0,
        .ws_ypixel = 0,
    };
    if (ioctl(descriptor, TIOCSWINSZ, &size) != 0) throw_errno(env, "resize terminal");
}

JNIEXPORT jint JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeWait(
        JNIEnv* env, jobject ignored_instance, jint pid) {
    (void)env;
    (void)ignored_instance;
    int status = 0;
    pid_t result;
    do {
        result = waitpid((pid_t)pid, &status, 0);
    } while (result < 0 && errno == EINTR);
    if (result < 0) return -1;
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return -WTERMSIG(status);
    return -1;
}

JNIEXPORT void JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeSignal(
        JNIEnv* env, jobject ignored_instance, jint pid, jint signal_number) {
    (void)ignored_instance;
    if (kill(-(pid_t)pid, signal_number) != 0 && errno != ESRCH) throw_errno(env, "signal terminal");
}

JNIEXPORT void JNICALL
Java_com_copper_copperexec_CopperPtyNative_nativeClose(
        JNIEnv* env, jobject ignored_instance, jint descriptor) {
    (void)env;
    (void)ignored_instance;
    if (close(descriptor) != 0 && errno != EBADF) throw_errno(env, "close terminal");
}
