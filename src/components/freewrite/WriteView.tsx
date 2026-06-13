import { Textarea } from "@/components/ui/textarea";

type WriteViewProps = {
  content: string;
  onContentChange: (content: string) => void;
};

export function WriteView({ content, onContentChange }: WriteViewProps) {
  return (
    <section className="flex min-h-0 flex-1 px-5 pb-24 pt-10 sm:px-10 md:px-16 lg:px-24">
      <Textarea
        aria-label="Freewrite"
        autoFocus
        className="mx-auto h-full max-w-5xl flex-1 resize-none rounded-none border-0 bg-transparent p-0 font-serif text-2xl leading-[1.75] shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-3xl"
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="Just start"
        spellCheck
        value={content}
      />
    </section>
  );
}

