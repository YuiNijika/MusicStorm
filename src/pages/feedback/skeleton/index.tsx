import { Skeleton as Block } from "@/components/ui/skeleton"

const COMMENT_ROWS = [0, 1, 2]
const CONTACT_FIELDS = [0, 1, 2]

function Skeleton() {
    return (
        <div role="status" aria-label="反馈加载中" className="feedback-skeleton">
            <div aria-hidden="true">
                <div className="feedback-form">
                    <Block className="h-6 w-24" />
                    <div className="feedback-field">
                        <Block className="h-5 w-20" />
                        <Block className="h-36 w-full rounded-lg" />
                    </div>
                    <div className="feedback-contact-fields">
                        {CONTACT_FIELDS.map((field) => (
                            <div key={field} className="feedback-field">
                                <Block className="h-5 w-16" />
                                <Block className="h-12 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>
                    <Block className="h-[1.125rem] w-36" />
                    <div className="feedback-form-actions">
                        <Block className="h-11 w-32 rounded-lg" />
                    </div>
                </div>
                <div className="feedback-comments">
                    <div className="feedback-section-header">
                        <Block className="h-6 w-24" />
                        <Block className="h-4 w-6" />
                    </div>
                    <div className="feedback-threads">
                        {COMMENT_ROWS.map((row) => (
                            <div key={row} className="feedback-comment">
                                <Block className="feedback-avatar" />
                                <div className="feedback-comment-body space-y-3">
                                    <div className="feedback-comment-meta">
                                        <Block className="h-5 w-20" />
                                        <Block className="h-3 w-28" />
                                    </div>
                                    <Block className="h-3.5 w-[85%]" />
                                    <Block className={`h-3.5 ${row === 1 ? "w-1/2" : "w-2/3"}`} />
                                    <Block className="h-3 w-10" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export { Skeleton }
