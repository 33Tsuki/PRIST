import { useCallback } from 'react'
import api from '@/lib/axios'
import type { MasterDataEntityType } from '@/types'

function getTemplateUrl(entityType: MasterDataEntityType) {
  switch (entityType) {
    case 'items':
      return '/master-data/ingestion/templates/items'
    case 'markets':
      return '/master-data/ingestion/templates/markets'
    case 'shops':
      return '/master-data/ingestion/templates/shops'
    case 'shops-direct':
      return '/master-data/ingestion/templates/shops-direct'
  }
}

export function useTemplateDownload(entityType: MasterDataEntityType) {
  return useCallback(async () => {
    const response = await api.get(getTemplateUrl(entityType), {
      responseType: 'blob',
    })

    const disposition = response.headers['content-disposition']
    const filename = disposition?.match(/filename=(.+)/)?.[1] ?? `${entityType}_template.xlsx`

    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [entityType])
}
