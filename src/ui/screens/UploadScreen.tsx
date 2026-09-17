import { useRef, useState } from 'react'
import { useAppStore } from '../../state/store'
import { ConfirmDialog } from '../components/ConfirmDialog'

export function UploadScreen() {
  const images = useAppStore((s) => s.images)
  const ocrProgress = useAppStore((s) => s.ocrProgress)
  const isProcessing = useAppStore((s) => s.isProcessing)
  const addImages = useAppStore((s) => s.addImages)
  const rotateImage = useAppStore((s) => s.rotateImage)
  const removeImage = useAppStore((s) => s.removeImage)
  const runOcr = useAppStore((s) => s.runOcr)
  const goTo = useAppStore((s) => s.goTo)
  const itemCount = useAppStore((s) => s.menu.items.length)

  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const anyPending = images.some((image) => image.status !== 'done')
  const failed = images.filter((image) => image.status === 'error')

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) await addImages(files)
  }

  return (
    <>
      <div className="notice notice--info">
        <span aria-hidden="true">🔒</span>
        <span>
          התמונות נשארות במכשיר שלכם ואינן נשלחות לשום שרת. זיהוי הטקסט רץ בתוך הדפדפן. בהפעלה
          הראשונה יורדים קובצי שפה (כ‑10–15MB) — לכך נדרש חיבור לאינטרנט פעם אחת.
        </span>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>תמונות התפריט</h2>
        </div>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPick}
          className="visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          onChange={onPick}
          className="visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        <div className="btn-row" style={{ marginBlockEnd: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => cameraInput.current?.click()}>
            צילום תפריט
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            בחירת תמונות
          </button>
        </div>

        {images.length === 0 ? (
          <div className="dropzone">
            <p className="muted">עדיין לא הוספתם תמונות.</p>
            <p className="faint">
              טיפ: צלמו כל עמוד בנפרד, קרוב וישר. תאורה טובה משפרת מאוד את הזיהוי.
            </p>
          </div>
        ) : (
          <div className="thumbs">
            {images.map((image) => {
              const progress = ocrProgress[image.id]
              return (
                <figure className="thumb" key={image.id} style={{ margin: 0 }}>
                  <img
                    className="thumb__img"
                    src={image.previewUrl}
                    alt={`תצוגה מקדימה של ${image.name}`}
                    style={{ transform: `rotate(${image.rotationDeg}deg)` }}
                  />
                  <figcaption className="thumb__body">
                    <span className="faint" style={{ overflowWrap: 'anywhere' }}>{image.name}</span>

                    {image.status === 'done' ? (
                      <span className="badge badge--info">זוהו {image.itemCount} פריטים</span>
                    ) : null}
                    {image.status === 'pending' ? <span className="badge badge--muted">ממתין לזיהוי</span> : null}
                    {image.status === 'processing' ? (
                      <>
                        <div className="progress">
                          <div
                            className="progress__fill"
                            style={{ inlineSize: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
                          />
                        </div>
                        <span className="faint" aria-live="polite">
                          {progress?.message ?? 'מעבד…'}
                        </span>
                      </>
                    ) : null}
                    {image.status === 'error' ? (
                      <>
                        <span className="badge badge--review">שגיאה</span>
                        <span className="faint">{image.error}</span>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => runOcr([image.id])}
                          disabled={isProcessing}
                        >
                          נסו שוב
                        </button>
                      </>
                    ) : null}

                    <span className="thumb__actions">
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => rotateImage(image.id)}
                        disabled={isProcessing}
                      >
                        סובב
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setPendingDelete(image.id)}
                        disabled={isProcessing}
                      >
                        מחק
                      </button>
                    </span>
                  </figcaption>
                </figure>
              )
            })}
          </div>
        )}
      </div>

      {failed.length > 0 ? (
        <div className="notice notice--warn">
          <span aria-hidden="true">⚠</span>
          <span>{failed.length} תמונות נכשלו. אפשר לנסות שוב, לסובב אותן, או להמשיך ולהוסיף פריטים ידנית.</span>
        </div>
      ) : null}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => runOcr()}
          disabled={images.length === 0 || isProcessing || !anyPending}
        >
          {isProcessing ? 'מזהה…' : 'חלץ מנות מהתמונות'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => goTo('review')}
          disabled={isProcessing}
        >
          {itemCount > 0 ? `מעבר לבדיקה (${itemCount})` : 'הזנה ידנית'}
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="למחוק את התמונה?"
        body="הפריטים שחולצו מהתמונה הזו בלבד יימחקו גם הם."
        confirmLabel="מחק"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void removeImage(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </>
  )
}
