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
    /** 无障碍 / 占位前缀 */
    label?: string
    className?: string
}

/** 紧凑排序下拉，挂 Section / 标题右侧 */
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
                    "h-8 min-w-[7.5rem] cursor-pointer rounded-full border-0 bg-black/[0.06] px-3 text-[12px] font-medium shadow-none dark:bg-white/[0.1]",
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