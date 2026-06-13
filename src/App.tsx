import { Textarea } from "@/components/ui/textarea";

function App() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground antialiased">
      <div className="texture" />
      <main className="relative z-10 h-dvh p-4 sm:p-6 md:p-8">
        <Textarea
          aria-label="Freewrite"
          autoFocus
          className="h-full min-h-0 resize-none rounded-none border-0 bg-transparent p-0 font-serif text-xl leading-9 shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-2xl sm:leading-10 md:text-3xl md:leading-[3rem]"
          placeholder="Start writing..."
          spellCheck
        />
      </main>
    </div>
  );
}

export default App;
