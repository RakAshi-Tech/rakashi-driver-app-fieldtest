'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/app/context/LanguageContext'

interface Props {
  deliveryId: string
  onPhotoSaved: (url: string) => void
}

export const DeliveryPhotoCapture = ({ deliveryId, onPhotoSaved }: Props) => {
  const { t } = useLang()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const fileName = `${deliveryId}_${Date.now()}.jpg`
      const { error } = await supabase.storage
        .from('delivery-photos')
        .upload(fileName, file, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(fileName)

      const publicUrl = urlData.publicUrl
      setPhotoUrl(publicUrl)
      localStorage.setItem('deliveryPhotoUrl', publicUrl)
      onPhotoSaved(publicUrl)
    } catch (err) {
      console.error('Photo upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      padding: '12px 16px',
      background: '#1a1a2e',
      borderTop: '1px solid #374151',
    }}>
      <label style={{
        fontSize: '12px',
        color: '#9ca3af',
        display: 'block',
        marginBottom: '8px'
      }}>
        {t('deliveryPhoto')}
      </label>

      {photoUrl ? (
        <div style={{ position: 'relative' }}>
          <img
            src={photoUrl}
            alt="delivery"
            style={{
              width: '100%',
              height: '120px',
              objectFit: 'cover',
              borderRadius: '8px',
            }}
          />
          <button
            onClick={() => {
              setPhotoUrl(null)
              localStorage.removeItem('deliveryPhotoUrl')
            }}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {t('retake')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            width: '100%',
            padding: '12px',
            background: uploading ? '#374151' : '#1f2937',
            border: '1px dashed #4b5563',
            borderRadius: '8px',
            color: uploading ? '#6b7280' : '#9ca3af',
            fontSize: '14px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {uploading ? t('uploading') : `📷 ${t('takePhoto')}`}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        style={{ display: 'none' }}
      />
    </div>
  )
}
