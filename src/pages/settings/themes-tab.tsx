import { useMemo, useState } from "react"

import { useTheme } from "@/components/app/theme-provider"
import { ThemeCard } from "@/components/settings/theme-card"
import { THEME_DEFINITIONS } from "@/lib/theme/themes"
import type { ThemeDefinition } from "@/lib/theme/types"
import {
    ChoiceChip,
    ChipRow,
    SettingsGroup,
    TabHeader,
} from "@/pages/settings/settings-ui"

type ThemeCategory = "all" | ThemeDefinition["category"]

const CATEGORY_OPTIONS: { id: ThemeCategory; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "classic", label: "经典界面" },
    { id: "immersive", label: "沉浸配色" },
    { id: "minimal", label: "极简" },
]

function ThemesTab() {
    const { resolvedTheme, themeStyle, setThemeStyle } = useTheme()
    const [category, setCategory] = useState<ThemeCategory>("all")
    const visible = useMemo(
        () =>
            category === "all"
                ? THEME_DEFINITIONS
                : THEME_DEFINITIONS.filter(
                    (item) => item.category === category,
                ),
        [category],
    )

    return (
        <div className="space-y-3">
            <TabHeader
                title="主题"
                description="选择界面色彩、材质与主题字体"
            />

            <SettingsGroup title="主题风格" description="字体和材质会随主题一起切换">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <ChipRow>
                        {CATEGORY_OPTIONS.map((item) => (
                            <ChoiceChip
                                key={item.id}
                                label={item.label}
                                active={category === item.id}
                                onClick={() => setCategory(item.id)}
                            />
                        ))}
                    </ChipRow>
                    <span className="text-[12px] text-muted-foreground">
                        {visible.length}套
                    </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((item) => (
                        <ThemeCard
                            key={item.id}
                            theme={item}
                            mode={resolvedTheme}
                            active={themeStyle === item.id}
                            onSelect={() => setThemeStyle(item.id)}
                        />
                    ))}
                </div>
            </SettingsGroup>
        </div>
    )
}

export { ThemesTab }
