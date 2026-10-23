import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Chemins relatifs : le site fonctionne sur GitHub Pages quel que soit le nom du dépôt
// (le routage se fait par le hash, ex. /#/planning).
export default defineConfig({
  base: './',
  plugins: [react()],
});
