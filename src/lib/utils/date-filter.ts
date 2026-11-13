export function getDateRangeFromFilter(filter: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const formatDate = (d: Date, endOfDay = false) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const time = endOfDay ? '23:59:59' : '00:00:00'

    return `${year}-${month}-${day}T${time}`
  }

  switch (filter) {
    case 'hoje':
      return {
        startDate: formatDate(today),
        endDate: formatDate(now, true),
        granularity: 'day',
      }
    case 'ontem': {
      const ontem = new Date(today)
      ontem.setDate(today.getDate() - 1)
      return {
        startDate: formatDate(ontem),
        endDate: formatDate(ontem, true),
        granularity: 'day',
      }
    }
    case 'ultimos-7-dias': {
      const d = new Date(today)
      d.setDate(today.getDate() - 7)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'day',
      }
    }
    case 'ultimos-30-dias': {
      const d = new Date(today)
      d.setDate(today.getDate() - 30)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'day',
      }
    }
    case 'mes-atual': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'day',
      }
    }
    case 'ultimos-60-dias': {
      const d = new Date(today)
      d.setDate(today.getDate() - 60)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'day',
      }
    }
    case 'ultimos-90-dias': {
      const d = new Date(today)
      d.setDate(today.getDate() - 90)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'week',
      }
    }
    case 'ultimos-180-dias': {
      const d = new Date(today)
      d.setDate(today.getDate() - 180)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'month',
      }
    }
    case 'ano-atual': {
      const d = new Date(today.getFullYear(), 0, 1)
      return {
        startDate: formatDate(d),
        endDate: formatDate(now, true),
        granularity: 'month',
      }
    }
    default:
      return {
        granularity: 'day',
      }
  }
}
