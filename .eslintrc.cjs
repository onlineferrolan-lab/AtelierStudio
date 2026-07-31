module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-hooks', 'react-refresh'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': [
      'warn',
      {
        allowConstantExport: true,
        // Patrón contexto React: el provider (componente) convierte en el mismo
        // archivo con sus hooks y factorías asociados; se permite su exportación
        // explícita para no fragmentar cada contexto en varios módulos.
        allowExportNames: [
          'usePanelDerecho',
          'useEstadoConfig',
          'useConfig',
          'estadoInicial',
          'useAtelier',
          'construirEntrada',
          'construirEntradaDePieza',
          'construirEntradasPedido',
          'useSalidaMotor',
          'usePedido',
          'useMargenDeMaterial',
          'useMedidasValidadas',
          'medidasTecleadas',
          'usePasos',
          'usePasoCompletado',
        ],
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  overrides: [
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx'],
      env: { node: true },
    },
    {
      // Scripts de línea de comandos (generación del índice del catálogo y del
      // manual de usuario): corren en Node, no en el navegador.
      files: ['scripts/**/*.mjs'],
      env: { node: true, browser: false },
    },
  ],
};
