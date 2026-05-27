interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  loading?: boolean;
}

export function MultiSelect({ options, selected, onChange, placeholder, loading }: MultiSelectProps) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-5 bg-gray-100 rounded" />
        ))}
      </div>
    );
  }

  if (options.length === 0) {
    return <p className="text-xs text-gray-400 italic">{placeholder ?? "No options available"}</p>;
  }

  return (
    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
      {options.map(opt => (
        <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="rounded border-gray-300 text-forest-600 focus:ring-forest-500 shrink-0"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900 leading-none">
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}
