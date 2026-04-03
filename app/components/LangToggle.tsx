'use client'
import { useLang } from '../context/LanguageContext'

export const LangToggle = () => {
  const { lang, setLang, t } = useLang()
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {(['hi', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          style={{
            padding: '4px 12px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: lang === l ? 'bold' : 'normal',
            backgroundColor: lang === l ? '#f97316' : '#374151',
            color: lang === l ? '#ffffff' : '#9ca3af',
          }}
        >
          {l === 'hi' ? t('langHi') : t('langEn')}
        </button>
      ))}
    </div>
  )
}
