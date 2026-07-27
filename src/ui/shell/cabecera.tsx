/**
 * Cabecera de Atelier Studio: logotipo de Ferrolan + «Atelier Studio» y
 * subtítulo de uso interno (§1).
 */

export function Cabecera(): JSX.Element {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 lg:px-8">
        <img src={`${import.meta.env.BASE_URL}ferrolan-logo.png`} alt="Ferrolan" className="h-12 w-auto" />
        <h1 className="border-l border-slate-200 pl-4 text-xl font-light text-slate-700">
          Atelier Studio
        </h1>
        <p className="ml-auto text-sm text-slate-500">
          Configurador de piezas de taller — uso interno
        </p>
      </div>
    </header>
  );
}
