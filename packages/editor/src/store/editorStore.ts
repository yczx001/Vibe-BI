import { create } from 'zustand';

export interface EditorState {
  selectedComponent: string | null;
  isGenerating: boolean;
  pages: string[];
  currentPage: string;
}

export interface EditorActions {
  setSelectedComponent: (id: string | null) => void;
  setIsGenerating: (value: boolean) => void;
  addPage: (name: string) => void;
  setCurrentPage: (id: string) => void;
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  selectedComponent: null,
  isGenerating: false,
  pages: ['page1'],
  currentPage: 'page1',

  setSelectedComponent: (id) => set({ selectedComponent: id }),
  setIsGenerating: (value) => set({ isGenerating: value }),
  addPage: (name) =>
    set((state) => ({
      pages: [...state.pages, name],
    })),
  setCurrentPage: (id) => set({ currentPage: id }),
}));
