import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '@/src/utils/id';

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectsState {
  projects: Project[];
  createProject: (name: string, description?: string) => Project;
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description'>>) => void;
  deleteProject: (id: string) => void;
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      createProject: (name, description = '') => {
        const project = { id: uid('p'), name: name.trim() || 'Untitled project', description: description.trim(), createdAt: Date.now(), updatedAt: Date.now() };
        set((s) => ({ projects: [project, ...s.projects] }));
        return project;
      },
      updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p) })),
      deleteProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
    }),
    { name: 'copper/projects/v1', storage: createJSONStorage(() => AsyncStorage) }
  )
);
