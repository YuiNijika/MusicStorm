import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type SortOption<T extends string> = {
    value: T
    label: string
}

type SortSelectProps<T extends string> = {
    value: T
    options: ReadonlyArray<SortOption<T>>
    onChange: (value: T) => void
    label?: string
    className?: string
}

function SortSelect<T extends string>({
    value,
    options,
    onChange,
    label = "排序",
    className,
}: SortSelectProps<T>) {
    const current = options.find((item) => item.value === value)?.label ?? label

    return (
        <Select
            value={value}
            onValueChange={(next) => {
                if (next == null) {
                    return
                }
                onChange(next as T)
            }}
        >
            <SelectTrigger
                size="sm"
                aria-label={label}
                className={cn(
                    "apple-control h-9 min-w-[7.5rem] cursor-pointer border-0 px-3 text-[13px] font-medium shadow-none",
                    className,
                )}
            >
                <SelectValue>{current}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[8rem]">
                {options.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                        {item.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export { SortSelect }