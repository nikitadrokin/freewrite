import { Textarea } from '@/components/ui/textarea';

type WriteViewProps = {
  content: string;
  onContentChange: (content: string) => void;
};

export function WriteView({ content, onContentChange }: WriteViewProps) {
  return (
    <section className='flex min-h-0 flex-1'>
      <Textarea
        aria-label='Freewrite'
        autoFocus
        className='mx-auto h-full max-w-5xl flex-1 resize-none rounded-none border-0 bg-transparent font-serif leading-[1.75] shadow-none focus-visible:border-0 focus-visible:ring-0 p-5 md:p-12'
        onChange={(event) => onContentChange(event.target.value)}
        placeholder='Just start'
        spellCheck
        value={content}
      />
    </section>
  );
}
