cmake_minimum_required(VERSION 3.22.1)
project(copper_pty C)

add_library(copper_pty SHARED copper_pty.c)

find_library(log-lib log)

target_compile_features(copper_pty PRIVATE c_std_11)
target_compile_options(copper_pty PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(copper_pty ${log-lib})
