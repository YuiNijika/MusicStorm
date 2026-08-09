import { useState } from "react"

import { AccordionGallery } from "../accordion-gallery/accordion-gallery"
import type { AccordionGalleryItem } from "../accordion-gallery/accordion-gallery"
import { Lightbox } from "../lightbox/lightbox"

import "./screenshots.css"

const SHOTS: AccordionGalleryItem[] = [
    { image: "/image/index.webp", label: "首页" },
    { image: "/image/local.webp", label: "本地乐库" },
    { image: "/image/screenshots.webp", label: "全屏播放" },
    { image: "/image/lyrics.webp", label: "歌词视图" },
    { image: "/image/statistics.webp", label: "统计" },
]

function Screenshots() {
    // null = 灯箱关闭；数字 = 当前预览的截图下标
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    return (
        <section className="screenshots" id="screenshots">
            <div className="screenshots__inner">
                <h2 className="display-lg screenshots__title reveal">眼见为实。</h2>
                <div className="screenshots__gallery reveal">
                    <AccordionGallery
                        items={SHOTS}
                        defaultIndex={2}
                        radius={18}
                        trigger="hover"
                        onActiveClick={setLightboxIndex}
                    />
                </div>
            </div>
            {lightboxIndex !== null ? (
                <Lightbox
                    items={SHOTS}
                    index={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                    onNavigate={setLightboxIndex}
                />
            ) : null}
        </section>
    )
}

export { Screenshots }
