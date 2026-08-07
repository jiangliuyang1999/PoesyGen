import {
  useLayoutEffect,
  useRef,
  type ChangeEventHandler,
  type TextareaHTMLAttributes,
} from 'react';

interface AutoResizeTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'rows' | 'value'
> {
  readonly value: string;
  readonly minRows: number;
  readonly maxRows: number;
  readonly onChange: ChangeEventHandler<HTMLTextAreaElement>;
}

export function AutoResizeTextarea({
  value,
  minRows,
  maxRows,
  onChange,
  ...props
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;

    const resize = (): void => resizeTextarea(textarea, minRows, maxRows);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [maxRows, minRows, value]);

  return <textarea {...props} ref={textareaRef} value={value} rows={minRows} onChange={onChange} />;
}

function resizeTextarea(textarea: HTMLTextAreaElement, minRows: number, maxRows: number): void {
  const style = getComputedStyle(textarea);
  const fontSize = cssPixels(style.fontSize, 16);
  const lineHeight = cssPixels(style.lineHeight, fontSize * 1.8);
  const padding = cssPixels(style.paddingTop, 0) + cssPixels(style.paddingBottom, 0);
  const borders = cssPixels(style.borderTopWidth, 0) + cssPixels(style.borderBottomWidth, 0);
  const minHeight = lineHeight * minRows + padding + borders;
  const maxHeight = lineHeight * maxRows + padding + borders;

  textarea.style.height = '0px';
  const contentHeight = textarea.scrollHeight + borders;
  textarea.style.height = `${Math.ceil(Math.min(maxHeight, Math.max(minHeight, contentHeight)))}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}

function cssPixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
