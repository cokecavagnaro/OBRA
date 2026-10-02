interface Props {
  title: string
  backLabel?: string
  onBack?: () => void
  right?: React.ReactNode
}

export default function Header({ title, backLabel, onBack, right }: Props) {
  return (
    <header className="bg-crema-header border-b-2 border-tinta px-[18px] py-[14px] flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {backLabel && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="border-2 border-tinta bg-white shadow-hard-sm px-3 py-2 text-xs font-bold min-h-[44px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            ← {backLabel}
          </button>
        )}
        <h1 className="text-sm font-bold">{title}</h1>
      </div>
      {right}
    </header>
  )
}
