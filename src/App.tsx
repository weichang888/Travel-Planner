import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'

type PageView = 'itinerary' | 'journal' | 'journalEdit' | 'shopping' | 'shoppingEdit'
type ActivityCategory = 'food' | 'spot' | 'transport'
type ChartType = 'pie' | 'donut' | 'bar'

type JournalTextSegment = {
  id: string
  text: string
  textColor: string
}

type Activity = {
  id: string
  time: string
  title: string
  category: ActivityCategory
  imageUrl: string
}

type ItineraryDay = {
  id: string
  label: string
  activities: Activity[]
}

type JournalEntry = {
  id: string
  title: string
  reflection?: string
  segments: JournalTextSegment[]
  imageUrls: string[]
  imageUrl?: string
  createdAt: string
}

type JournalFormState = {
  title: string
  segments: JournalTextSegment[]
  imageInput: string
  imageUrls: string[]
}

type ChecklistItem = {
  id: string
  label: string
  done: boolean
}

type ShoppingItem = {
  id: string
  name: string
  category: string
  quantity: number
  unitPrice: number
  purchased: boolean
  note: string
  imageUrl: string
  createdAt: string
}

type TripRecord = {
  id: string
  name: string
  coverImageUrl: string
  itineraryDays: ItineraryDay[]
  journalEntries: JournalEntry[]
  checklist: ChecklistItem[]
  shoppingCategories: string[]
  shoppingItems: ShoppingItem[]
}

type ChartDatum = {
  label: string
  value: number
  color: string
}

type PersistedAppState = {
  userName: string
  currentView: PageView
  trips: TripRecord[]
  selectedTripId: string | null
  activeDayByTrip: Record<string, string>
  chartType: ChartType
}

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-notion-text outline-none transition focus:border-gray-400'

const STORAGE_KEY = 'travel-planner-journal-v1'

const categoryText: Record<ActivityCategory, string> = {
  food: '美食',
  spot: '景點',
  transport: '交通',
}

const DEFAULT_SHOPPING_CATEGORIES = ['餐飲', '交通', '伴手禮', '門票', '住宿', '其他']

const LEGACY_SHOPPING_CATEGORY_MAP: Record<string, string> = {
  food: '餐飲',
  transport: '交通',
  souvenir: '伴手禮',
  ticket: '門票',
  hotel: '住宿',
  other: '其他',
}

const SHOPPING_CHART_COLOR_PALETTE = [
  '#f59e0b',
  '#0ea5e9',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#22c55e',
  '#ef4444',
  '#a855f7',
  '#f97316',
  '#64748b',
]

const getShoppingCategoryColor = (category: string) => {
  let hash = 0
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash + category.charCodeAt(i) * (i + 1)) % SHOPPING_CHART_COLOR_PALETTE.length
  }
  return SHOPPING_CHART_COLOR_PALETTE[hash]
}

const viewItems: { key: PageView; label: string; emoji: string }[] = [
  { key: 'itinerary', label: '旅遊規劃', emoji: '🗓️' },
  { key: 'journal', label: '旅遊心得', emoji: '📓' },
  { key: 'journalEdit', label: '編輯心得', emoji: '✍️' },
  { key: 'shopping', label: '購物清單', emoji: '🧾' },
  { key: 'shoppingEdit', label: '編輯購物', emoji: '🛒' },
]

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const createDay = (number: number): ItineraryDay => ({
  id: createId('day'),
  label: `Day ${number}`,
  activities: [],
})

const normalizeShoppingCategory = (value: unknown) => {
  if (typeof value !== 'string') {
    return '其他'
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return '其他'
  }
  return LEGACY_SHOPPING_CATEGORY_MAP[trimmed] ?? trimmed
}

const dedupeShoppingCategories = (categories: string[]) => {
  const set = new Set<string>()
  for (const raw of categories) {
    const normalized = normalizeShoppingCategory(raw)
    if (normalized) {
      set.add(normalized)
    }
  }
  if (!set.has('其他')) {
    set.add('其他')
  }
  return Array.from(set)
}

const createJournalSegment = (): JournalTextSegment => ({
  id: createId('segment'),
  text: '',
  textColor: '#374151',
})

const createEmptyJournalForm = (): JournalFormState => ({
  title: '',
  segments: [createJournalSegment()],
  imageInput: '',
  imageUrls: [],
})

const getJournalSegments = (entry: JournalEntry): JournalTextSegment[] => {
  if (entry.segments && entry.segments.length > 0) {
    return entry.segments.map((segment) => ({
      id: segment.id || createId('segment'),
      text: segment.text || '',
      textColor: segment.textColor || '#374151',
    }))
  }

  if (entry.reflection) {
    return [
      {
        id: `${entry.id}-legacy`,
        text: entry.reflection,
        textColor: '#374151',
      },
    ]
  }

  return []
}

const getJournalImages = (entry: JournalEntry): string[] => {
  if (entry.imageUrls && entry.imageUrls.length > 0) {
    return entry.imageUrls
  }

  if (typeof entry.imageUrl === 'string' && entry.imageUrl) {
    return [entry.imageUrl]
  }

  return []
}

const createTrip = (name: string): TripRecord => {
  const firstDay = createDay(1)
  return {
    id: createId('trip'),
    name,
    coverImageUrl: '',
    itineraryDays: [firstDay],
    journalEntries: [],
    checklist: [],
    shoppingCategories: [...DEFAULT_SHOPPING_CATEGORIES],
    shoppingItems: [],
  }
}

const hydrateTrips = (value: unknown): TripRecord[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((trip) => {
    const raw = trip as {
      id?: unknown
      name?: unknown
      coverImageUrl?: unknown
      itineraryDays?: unknown
      journalEntries?: unknown
      checklist?: unknown
      shoppingCategories?: unknown
      shoppingItems?: unknown
    }
    const rawJournalEntries = Array.isArray(raw.journalEntries)
      ? (raw.journalEntries as Array<
          Partial<JournalEntry> & { imageUrl?: string; textColor?: string }
        >)
      : []
    const rawShoppingItems = Array.isArray(raw.shoppingItems) ? raw.shoppingItems : []
    const shoppingItems: ShoppingItem[] = rawShoppingItems.map((item) => {
      const s = item as Partial<ShoppingItem> & { image?: unknown; imageUrl?: unknown }
      const quantity = Number(s.quantity)
      const unitPrice = Number(s.unitPrice)
      return {
        id: typeof s.id === 'string' ? s.id : createId('shopping'),
        name: typeof s.name === 'string' ? s.name : '',
        category: normalizeShoppingCategory(s.category),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        purchased: Boolean(s.purchased),
        note: typeof s.note === 'string' ? s.note : '',
        imageUrl:
          typeof s.imageUrl === 'string'
            ? s.imageUrl
            : typeof s.image === 'string'
              ? s.image
              : '',
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString().slice(0, 10),
      }
    })

    const rawShoppingCategories = Array.isArray(raw.shoppingCategories)
      ? raw.shoppingCategories.filter((category): category is string => typeof category === 'string')
      : []
    const shoppingCategories = dedupeShoppingCategories([
      ...DEFAULT_SHOPPING_CATEGORIES,
      ...rawShoppingCategories,
      ...shoppingItems.map((item) => item.category),
    ])

    return {
      id: typeof raw.id === 'string' ? raw.id : createId('trip'),
      name: typeof raw.name === 'string' ? raw.name : '未命名旅程',
      coverImageUrl: typeof raw.coverImageUrl === 'string' ? raw.coverImageUrl : '',
      itineraryDays: Array.isArray(raw.itineraryDays) ? (raw.itineraryDays as ItineraryDay[]) : [],
      journalEntries: rawJournalEntries.length > 0
        ? rawJournalEntries.map((entry) => {
            const imageUrlsFromArray = Array.isArray(entry.imageUrls)
              ? entry.imageUrls.filter((img): img is string => typeof img === 'string')
              : []
            const legacyImage = typeof entry.imageUrl === 'string' ? entry.imageUrl : ''
            const legacyReflection = typeof entry.reflection === 'string' ? entry.reflection : ''
            const parsedSegments = Array.isArray((entry as { segments?: unknown }).segments)
              ? ((entry as { segments?: unknown[] }).segments ?? [])
                  .map((segment) => {
                    const s = segment as Partial<JournalTextSegment>
                    return {
                      id: typeof s.id === 'string' ? s.id : createId('segment'),
                      text: typeof s.text === 'string' ? s.text : '',
                      textColor: typeof s.textColor === 'string' ? s.textColor : '#374151',
                    }
                  })
                  .filter((segment) => segment.text.trim().length > 0)
              : []
            return {
              id: typeof entry.id === 'string' ? entry.id : createId('entry'),
              title: typeof entry.title === 'string' ? entry.title : '',
              reflection: legacyReflection,
              segments:
                parsedSegments.length > 0
                  ? parsedSegments
                  : legacyReflection
                    ? [
                        {
                          id: createId('segment'),
                          text: legacyReflection,
                          textColor: typeof entry.textColor === 'string' ? entry.textColor : '#374151',
                        },
                      ]
                    : [],
              imageUrls:
                imageUrlsFromArray.length > 0
                  ? imageUrlsFromArray
                  : legacyImage
                    ? [legacyImage]
                    : [],
              createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString().slice(0, 10),
            }
          })
        : [],
      checklist: Array.isArray(raw.checklist) ? (raw.checklist as ChecklistItem[]) : [],
      shoppingCategories,
      shoppingItems,
    }
  })
}

const getDefaultPersistedState = (): PersistedAppState => ({
  userName: '',
  currentView: 'itinerary',
  trips: [],
  selectedTripId: null,
  activeDayByTrip: {},
  chartType: 'pie',
})

const loadPersistedState = (): PersistedAppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return getDefaultPersistedState()
    }
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>
    return {
      userName: typeof parsed.userName === 'string' ? parsed.userName : '',
      currentView:
        parsed.currentView === 'itinerary' ||
        parsed.currentView === 'journal' ||
        parsed.currentView === 'journalEdit' ||
        parsed.currentView === 'shopping' ||
        parsed.currentView === 'shoppingEdit'
          ? parsed.currentView
          : 'itinerary',
      trips: hydrateTrips(parsed.trips),
      selectedTripId: typeof parsed.selectedTripId === 'string' ? parsed.selectedTripId : null,
      activeDayByTrip:
        parsed.activeDayByTrip && typeof parsed.activeDayByTrip === 'object'
          ? parsed.activeDayByTrip
          : {},
      chartType:
        parsed.chartType === 'pie' || parsed.chartType === 'donut' || parsed.chartType === 'bar'
          ? parsed.chartType
          : 'pie',
    }
  } catch {
    return getDefaultPersistedState()
  }
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(value)

const buildShoppingChartData = (items: ShoppingItem[], categories: string[]) => {
  const allCategories = dedupeShoppingCategories([...categories, ...items.map((item) => item.category)])
  const totals: Record<string, number> = {}

  for (const category of allCategories) {
    totals[category] = 0
  }

  for (const item of items) {
    const key = normalizeShoppingCategory(item.category)
    totals[key] = (totals[key] ?? 0) + item.quantity * item.unitPrice
  }

  return allCategories
    .filter((category) => (totals[category] ?? 0) > 0)
    .map((category) => ({
      label: category,
      value: totals[category] ?? 0,
      color: getShoppingCategoryColor(category),
    }))
}

const normalizeImageUrl = (raw: string) => {
  const value = raw.trim()
  if (!value) {
    return ''
  }

  try {
    const url = new URL(value)

    if (url.hostname === 'storage.cloud.google.com') {
      return `https://storage.googleapis.com${url.pathname}`
    }

    if (url.hostname.includes('drive.google.com')) {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/)
      if (fileMatch?.[1]) {
        return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`
      }

      const id = url.searchParams.get('id')
      if (id) {
        return `https://drive.google.com/uc?export=view&id=${id}`
      }
    }

    return value
  } catch {
    return value
  }
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsDataURL(file)
  })

function ImagePreview(props: { src: string; alt: string; className: string }) {
  const { src, alt, className } = props
  const normalized = normalizeImageUrl(src)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [normalized])

  if (!normalized || failed) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-5 text-xs text-gray-500">
        圖片無法顯示，請確認連結可公開存取（Google 雲端分享需開啟公開檢視）。
      </div>
    )
  }

  return <img src={normalized} alt={alt} className={className} onError={() => setFailed(true)} />
}

function ImageInputField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { id, label, value, onChange, placeholder = 'https://...' } = props

  const handleFile = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
      return
    }
    const dataUrl = await fileToDataUrl(file)
    onChange(dataUrl)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const file = event.dataTransfer.files?.[0] ?? null
    await handleFile(file)
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm text-gray-600">
        {label}
      </label>
      <input
        id={id}
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onDrop={(event) => {
          void handleDrop(event)
        }}
        className="rounded-md border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-500"
      >
        拖曳圖片到這裡，或
        <label htmlFor={`${id}-file`} className="cursor-pointer text-gray-700 underline">
          點此上傳
        </label>
        <input
          id={`${id}-file`}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null)
          }}
        />
      </div>
      <p className="text-xs text-gray-400">支援一般圖片網址、Google 雲端分享網址、以及拖曳本機圖片。</p>
    </div>
  )
}

function MultiImageInputField(props: {
  id: string
  label: string
  imageInput: string
  onImageInputChange: (value: string) => void
  images: string[]
  onImagesChange: (images: string[]) => void
}) {
  const { id, label, imageInput, onImageInputChange, images, onImagesChange } = props

  const addImageByUrl = () => {
    const value = imageInput.trim()
    if (!value) {
      return
    }
    onImagesChange([...images, value])
    onImageInputChange('')
  }

  const addImagesByFiles = async (files: FileList | null) => {
    if (!files) {
      return
    }
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      return
    }
    const dataUrls = await Promise.all(imageFiles.map((file) => fileToDataUrl(file)))
    onImagesChange([...images, ...dataUrls])
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm text-gray-600">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="url"
          value={imageInput}
          onChange={(event) => onImageInputChange(event.target.value)}
          placeholder="https://..."
          className={inputClass}
        />
        <button
          type="button"
          onClick={addImageByUrl}
          className="shrink-0 rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-100"
        >
          加入
        </button>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void addImagesByFiles(event.dataTransfer.files)
        }}
        className="rounded-md border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-500"
      >
        拖曳多張圖片到這裡，或
        <label htmlFor={`${id}-files`} className="cursor-pointer text-gray-700 underline">
          點此上傳
        </label>
        <input
          id={`${id}-files`}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void addImagesByFiles(event.target.files)
          }}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image, index) => (
            <div key={`${image}-${index}`} className="overflow-hidden rounded-lg border border-gray-200">
              <ImagePreview src={image} alt={`圖片 ${index + 1}`} className="h-24 w-full object-cover" />
              <button
                type="button"
                onClick={() => onImagesChange(images.filter((_, i) => i !== index))}
                className="w-full border-t border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">可加入多張圖片，支援 Google 雲端分享連結與拖曳上傳。</p>
    </div>
  )
}

function ChartView(props: {
  title: string
  data: ChartDatum[]
  chartType: ChartType
  emptyText: string
}) {
  const { title, data, chartType, emptyText } = props
  const total = data.reduce((sum, item) => sum + item.value, 0)

  const gradient = useMemo(() => {
    if (total <= 0) {
      return 'conic-gradient(#e5e7eb 0 100%)'
    }
    let cursor = 0
    const stops = data.map((item) => {
      const start = (cursor / total) * 100
      cursor += item.value
      const end = (cursor / total) * 100
      return `${item.color} ${start}% ${end}%`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [data, total])

  return (
    <article className="rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      {data.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">{emptyText}</p>
      ) : chartType === 'bar' ? (
        <div className="mt-4 space-y-2">
          {data.map((item) => {
            const ratio = total > 0 ? (item.value / total) * 100 : 0
            return (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{item.label}</span>
                  <span>{ratio.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded bg-gray-100">
                  <div
                    className="h-2 rounded"
                    style={{ width: `${ratio}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative h-44 w-44 shrink-0 rounded-full border border-gray-200" style={{ background: gradient }}>
            {chartType === 'donut' && (
              <div className="absolute inset-[28%] rounded-full bg-white" />
            )}
          </div>
          <div className="w-full space-y-2 text-xs">
            {data.map((item) => {
              const ratio = total > 0 ? (item.value / total) * 100 : 0
              return (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.label}</span>
                  </div>
                  <span>{ratio.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </article>
  )
}

function App() {
  const [initialState] = useState<PersistedAppState>(() => loadPersistedState())
  const [userName, setUserName] = useState(initialState.userName)
  const [currentView, setCurrentView] = useState<PageView>(initialState.currentView)
  const [trips, setTrips] = useState<TripRecord[]>(initialState.trips)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialState.selectedTripId)
  const [activeDayByTrip, setActiveDayByTrip] = useState<Record<string, string>>(initialState.activeDayByTrip)
  const [draggingActivityId, setDraggingActivityId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [chartType, setChartType] = useState<ChartType>(initialState.chartType)
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null)

  const [newTripName, setNewTripName] = useState('')
  const [todoInput, setTodoInput] = useState('')
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false)
  const [newShoppingCategory, setNewShoppingCategory] = useState('')

  const [activityForm, setActivityForm] = useState({
    time: '',
    title: '',
    category: 'spot' as ActivityCategory,
    imageUrl: '',
  })

  const [journalForm, setJournalForm] = useState<JournalFormState>(createEmptyJournalForm())

  const [shoppingForm, setShoppingForm] = useState({
    name: '',
    category: '其他',
    quantity: '1',
    unitPrice: '',
    note: '',
    imageUrl: '',
  })

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  )

  useEffect(() => {
    if (selectedTripId && !trips.some((trip) => trip.id === selectedTripId)) {
      setSelectedTripId(trips[0]?.id ?? null)
    }
  }, [selectedTripId, trips])

  useEffect(() => {
    const defaultCategory = selectedTrip?.shoppingCategories[0] ?? '其他'
    setShoppingForm((prev) => ({
      ...prev,
      category:
        selectedTrip && selectedTrip.shoppingCategories.includes(prev.category)
          ? prev.category
          : defaultCategory,
    }))
  }, [selectedTrip])

  useEffect(() => {
    setEditingJournalId(null)
    setJournalForm(createEmptyJournalForm())
  }, [selectedTripId])

  useEffect(() => {
    const payload: PersistedAppState = {
      userName,
      currentView,
      trips,
      selectedTripId,
      activeDayByTrip,
      chartType,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [userName, currentView, trips, selectedTripId, activeDayByTrip, chartType])

  const activeDayId =
    selectedTrip && selectedTrip.itineraryDays.length > 0
      ? activeDayByTrip[selectedTrip.id] ?? selectedTrip.itineraryDays[0].id
      : null

  const activeDay = useMemo(() => {
    if (!selectedTrip || !activeDayId) {
      return null
    }
    return selectedTrip.itineraryDays.find((day) => day.id === activeDayId) ?? null
  }, [activeDayId, selectedTrip])

  const shoppingSummary = useMemo(() => {
    const items = selectedTrip?.shoppingItems ?? []
    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const purchased = items
      .filter((item) => item.purchased)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    return {
      total,
      purchased,
      remaining: total - purchased,
    }
  }, [selectedTrip])

  const allShoppingChartData = useMemo(
    () => buildShoppingChartData(selectedTrip?.shoppingItems ?? [], selectedTrip?.shoppingCategories ?? []),
    [selectedTrip],
  )

  const purchasedShoppingChartData = useMemo(
    () =>
      buildShoppingChartData(
        (selectedTrip?.shoppingItems ?? []).filter((item) => item.purchased),
        selectedTrip?.shoppingCategories ?? [],
      ),
    [selectedTrip],
  )

  const updateTrip = (tripId: string, updater: (trip: TripRecord) => TripRecord) => {
    setTrips((prev) => prev.map((trip) => (trip.id === tripId ? updater(trip) : trip)))
  }

  const handleCreateTrip = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newTripName.trim()
    if (!name) {
      return
    }
    const trip = createTrip(name)
    setTrips((prev) => [...prev, trip])
    setSelectedTripId(trip.id)
    setActiveDayByTrip((prev) => ({ ...prev, [trip.id]: trip.itineraryDays[0].id }))
    setNewTripName('')
  }

  const handleDeleteTrip = (tripId: string) => {
    const target = trips.find((trip) => trip.id === tripId)
    if (!target) {
      return
    }
    const confirmed = window.confirm(`確定要刪除旅程「${target.name}」嗎？`)
    if (!confirmed) {
      return
    }

    const removedIndex = trips.findIndex((trip) => trip.id === tripId)
    const remaining = trips.filter((trip) => trip.id !== tripId)
    setTrips(remaining)

    setActiveDayByTrip((prev) => {
      const next = { ...prev }
      delete next[tripId]
      return next
    })

    if (selectedTripId === tripId) {
      const fallback = remaining[removedIndex] ?? remaining[removedIndex - 1] ?? null
      setSelectedTripId(fallback?.id ?? null)
      setIsAddActivityOpen(false)
      setEditingJournalId(null)
      setJournalForm(createEmptyJournalForm())
    }

    setOpenMenuId(null)
  }

  const handleCoverImageChange = (value: string) => {
    if (!selectedTrip) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({ ...trip, coverImageUrl: value }))
  }

  const handleAddDay = () => {
    if (!selectedTrip) {
      return
    }
    const day = createDay(selectedTrip.itineraryDays.length + 1)
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      itineraryDays: [...trip.itineraryDays, day],
    }))
    setActiveDayByTrip((prev) => ({ ...prev, [selectedTrip.id]: day.id }))
  }

  const handleDeleteDay = (dayId: string) => {
    if (!selectedTrip || selectedTrip.itineraryDays.length <= 1) {
      return
    }

    const confirmed = window.confirm('確定要刪除這一天與其中的活動嗎？')
    if (!confirmed) {
      return
    }

    const oldIndex = selectedTrip.itineraryDays.findIndex((day) => day.id === dayId)
    const remainingDays = selectedTrip.itineraryDays.filter((day) => day.id !== dayId)

    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      itineraryDays: remainingDays,
    }))

    if (activeDay?.id === dayId) {
      const fallback = remainingDays[oldIndex] ?? remainingDays[oldIndex - 1]
      if (fallback) {
        setActiveDayByTrip((prev) => ({ ...prev, [selectedTrip.id]: fallback.id }))
      }
    }

    setOpenMenuId(null)
  }

  const handleAddActivity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTrip || !activeDay || !activityForm.time.trim() || !activityForm.title.trim()) {
      return
    }

    const newActivity: Activity = {
      id: createId('activity'),
      time: activityForm.time,
      title: activityForm.title.trim(),
      category: activityForm.category,
      imageUrl: activityForm.imageUrl.trim(),
    }

    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      itineraryDays: trip.itineraryDays.map((day) =>
        day.id === activeDay.id ? { ...day, activities: [...day.activities, newActivity] } : day,
      ),
    }))

    setActivityForm({ time: '', title: '', category: 'spot', imageUrl: '' })
    setIsAddActivityOpen(false)
  }

  const handleDeleteActivity = (activityId: string) => {
    if (!selectedTrip || !activeDay) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      itineraryDays: trip.itineraryDays.map((day) =>
        day.id === activeDay.id
          ? { ...day, activities: day.activities.filter((activity) => activity.id !== activityId) }
          : day,
      ),
    }))
    setOpenMenuId(null)
  }

  const handleAddJournal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTrip || !journalForm.title.trim()) {
      return
    }
    const finalSegments = journalForm.segments
      .map((segment) => ({
        ...segment,
        text: segment.text.trim(),
      }))
      .filter((segment) => segment.text.length > 0)
    if (finalSegments.length === 0) {
      return
    }
    const finalImages = journalForm.imageInput.trim()
      ? [...journalForm.imageUrls, journalForm.imageInput.trim()]
      : journalForm.imageUrls

    const createdAt = new Date().toISOString().slice(0, 10)
    const nextEntry: JournalEntry = {
      id: editingJournalId ?? createId('entry'),
      title: journalForm.title.trim(),
      reflection: finalSegments.map((segment) => segment.text).join('\n'),
      segments: finalSegments,
      imageUrls: finalImages,
      createdAt,
    }

    updateTrip(selectedTrip.id, (trip) => {
      if (!editingJournalId) {
        return {
          ...trip,
          journalEntries: [nextEntry, ...trip.journalEntries],
        }
      }

      let updated = false
      const journalEntries = trip.journalEntries.map((entry) => {
        if (entry.id !== editingJournalId) {
          return entry
        }
        updated = true
        return {
          ...entry,
          title: nextEntry.title,
          reflection: nextEntry.reflection,
          segments: nextEntry.segments,
          imageUrls: nextEntry.imageUrls,
        }
      })

      return {
        ...trip,
        journalEntries: updated ? journalEntries : [nextEntry, ...journalEntries],
      }
    })

    setEditingJournalId(null)
    setJournalForm(createEmptyJournalForm())
    setCurrentView('journal')
  }

  const updateJournalSegment = (
    segmentId: string,
    patch: Partial<Pick<JournalTextSegment, 'text' | 'textColor'>>,
  ) => {
    setJournalForm((prev) => ({
      ...prev,
      segments: prev.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...patch } : segment,
      ),
    }))
  }

  const addJournalSegment = () => {
    setJournalForm((prev) => ({
      ...prev,
      segments: [...prev.segments, createJournalSegment()],
    }))
  }

  const removeJournalSegment = (segmentId: string) => {
    setJournalForm((prev) => {
      if (prev.segments.length <= 1) {
        return prev
      }
      return {
        ...prev,
        segments: prev.segments.filter((segment) => segment.id !== segmentId),
      }
    })
  }

  const handleDeleteJournal = (entryId: string) => {
    if (!selectedTrip) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      journalEntries: trip.journalEntries.filter((entry) => entry.id !== entryId),
    }))
    if (editingJournalId === entryId) {
      setEditingJournalId(null)
      setJournalForm(createEmptyJournalForm())
    }
    setOpenMenuId(null)
  }

  const handleEditJournal = (entryId: string) => {
    if (!selectedTrip) {
      return
    }
    const entry = selectedTrip.journalEntries.find((item) => item.id === entryId)
    if (!entry) {
      return
    }

    const segments = getJournalSegments(entry)
    const images = getJournalImages(entry)

    setJournalForm({
      title: entry.title,
      segments: segments.length > 0 ? segments : [createJournalSegment()],
      imageInput: '',
      imageUrls: [...images],
    })
    setEditingJournalId(entry.id)
    setCurrentView('journalEdit')
    setOpenMenuId(null)
  }

  const handleResetJournalEditor = () => {
    setEditingJournalId(null)
    setJournalForm(createEmptyJournalForm())
  }

  const handleAddTodo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTrip || !todoInput.trim()) {
      return
    }

    const newTodo: ChecklistItem = {
      id: createId('todo'),
      label: todoInput.trim(),
      done: false,
    }

    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      checklist: [...trip.checklist, newTodo],
    }))

    setTodoInput('')
  }

  const toggleTodo = (todoId: string) => {
    if (!selectedTrip) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      checklist: trip.checklist.map((item) =>
        item.id === todoId ? { ...item, done: !item.done } : item,
      ),
    }))
  }

  const handleDeleteTodo = (todoId: string) => {
    if (!selectedTrip) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      checklist: trip.checklist.filter((item) => item.id !== todoId),
    }))
    setOpenMenuId(null)
  }

  const handleAddShopping = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTrip || !shoppingForm.name.trim()) {
      return
    }

    const quantity = Number(shoppingForm.quantity)
    const unitPrice = Number(shoppingForm.unitPrice)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return
    }

    const normalizedCategory = normalizeShoppingCategory(shoppingForm.category)
    const newItem: ShoppingItem = {
      id: createId('shopping'),
      name: shoppingForm.name.trim(),
      category: normalizedCategory,
      quantity,
      unitPrice,
      purchased: false,
      note: shoppingForm.note.trim(),
      imageUrl: shoppingForm.imageUrl.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    }

    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      shoppingCategories: dedupeShoppingCategories([...trip.shoppingCategories, normalizedCategory]),
      shoppingItems: [newItem, ...trip.shoppingItems],
    }))

    setShoppingForm({
      name: '',
      category: normalizedCategory,
      quantity: '1',
      unitPrice: '',
      note: '',
      imageUrl: '',
    })
  }

  const handleAddShoppingCategory = () => {
    if (!selectedTrip) {
      return
    }
    const category = normalizeShoppingCategory(newShoppingCategory)
    if (!category) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      shoppingCategories: dedupeShoppingCategories([...trip.shoppingCategories, category]),
    }))
    setShoppingForm((prev) => ({ ...prev, category }))
    setNewShoppingCategory('')
  }

  const handleRenameShoppingCategory = (category: string) => {
    if (!selectedTrip) {
      return
    }
    const nextName = window.prompt('請輸入新的類別名稱', category)
    if (nextName === null) {
      return
    }
    const normalized = normalizeShoppingCategory(nextName)
    if (!normalized) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      shoppingCategories: dedupeShoppingCategories(
        trip.shoppingCategories.map((item) => (item === category ? normalized : item)),
      ),
      shoppingItems: trip.shoppingItems.map((item) =>
        item.category === category ? { ...item, category: normalized } : item,
      ),
    }))
    setShoppingForm((prev) => ({
      ...prev,
      category: prev.category === category ? normalized : prev.category,
    }))
    setOpenMenuId(null)
  }

  const handleDeleteShoppingCategory = (category: string) => {
    if (!selectedTrip || category === '其他') {
      return
    }
    const confirmed = window.confirm(`確定刪除類別「${category}」嗎？此類別商品將改為「其他」。`)
    if (!confirmed) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      shoppingCategories: dedupeShoppingCategories(
        trip.shoppingCategories
          .filter((item) => item !== category)
          .concat(trip.shoppingItems.some((item) => item.category === category) ? ['其他'] : []),
      ),
      shoppingItems: trip.shoppingItems.map((item) =>
        item.category === category ? { ...item, category: '其他' } : item,
      ),
    }))
    setShoppingForm((prev) => ({
      ...prev,
      category: prev.category === category ? '其他' : prev.category,
    }))
    setOpenMenuId(null)
  }

  const togglePurchased = (itemId: string) => {
    if (!selectedTrip) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      shoppingItems: trip.shoppingItems.map((item) =>
        item.id === itemId ? { ...item, purchased: !item.purchased } : item,
      ),
    }))
  }

  const handleDeleteShopping = (itemId: string) => {
    if (!selectedTrip) {
      return
    }
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      shoppingItems: trip.shoppingItems.filter((item) => item.id !== itemId),
    }))
    setOpenMenuId(null)
  }

  const moveActivityToIndex = (targetIndex: number) => {
    if (!selectedTrip || !activeDay || !draggingActivityId) {
      return
    }

    const items = activeDay.activities
    const fromIndex = items.findIndex((item) => item.id === draggingActivityId)
    if (fromIndex < 0) {
      return
    }

    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)

    let insertIndex = targetIndex
    if (targetIndex > fromIndex) {
      insertIndex -= 1
    }
    insertIndex = Math.max(0, Math.min(insertIndex, next.length))
    next.splice(insertIndex, 0, moved)

    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      itineraryDays: trip.itineraryDays.map((day) =>
        day.id === activeDay.id ? { ...day, activities: next } : day,
      ),
    }))

    setDraggingActivityId(null)
    setDropIndex(null)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
  }

  const handleDropToIndex = (index: number) => {
    moveActivityToIndex(index)
  }

  const renderDeleteMenu = (
    menuId: string,
    onDelete: () => void,
    disabled = false,
  ) => (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpenMenuId((prev) => (prev === menuId ? null : menuId))}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs transition hover:bg-gray-100"
        aria-label="更多選項"
      >
        ...
      </button>
      {openMenuId === menuId && (
        <div className="absolute right-0 z-30 mt-1 min-w-20 rounded-md border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="w-full rounded px-2 py-1 text-left text-xs transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            刪除
          </button>
        </div>
      )}
    </div>
  )

  const tripPill = (trip: TripRecord) => (
    <div
      key={trip.id}
      className={`flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 ${
        selectedTripId === trip.id ? 'ring-1 ring-gray-300' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setSelectedTripId(trip.id)
          setOpenMenuId(null)
        }}
        className="flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100"
      >
        {trip.name}
      </button>
      {renderDeleteMenu(`trip-${trip.id}`, () => handleDeleteTrip(trip.id))}
    </div>
  )

  return (
    <div className="min-h-screen bg-notion-bg font-sans text-notion-text" onClick={() => setOpenMenuId(null)}>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-notion-sidebar p-4 md:flex md:flex-col">
          <p className="mb-3 px-2 text-xs uppercase tracking-wide text-gray-500">旅程</p>

          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
            <label htmlFor="desktop-user-name" className="mb-1 block text-xs text-gray-500">
              使用者名稱
            </label>
            <input
              id="desktop-user-name"
              type="text"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="請輸入你的名字"
              className={inputClass}
            />
            <p className="mt-2 text-xs text-gray-500">您好，{userName.trim() || '旅人'}。</p>
          </div>

          <form onSubmit={handleCreateTrip} className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-white p-3">
            <input
              type="text"
              value={newTripName}
              onChange={(event) => setNewTripName(event.target.value)}
              placeholder="新增旅程名稱"
              className={inputClass}
            />
            <button
              type="submit"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-100"
            >
              + 新增旅程
            </button>
          </form>

          <div className="space-y-2">{trips.map((trip) => tripPill(trip))}</div>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <p className="mb-2 px-2 text-xs uppercase tracking-wide text-gray-500">頁面</p>
            <nav className="space-y-1">
              {viewItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setCurrentView(item.key)
                    setOpenMenuId(null)
                  }}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm transition hover:bg-gray-100 ${
                    currentView === item.key ? 'bg-gray-100 font-medium' : ''
                  }`}
                >
                  {item.emoji} {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1">
          <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
            <section className="w-full max-w-4xl flex-1 space-y-6">
              <div className="rounded-lg border border-gray-200 bg-notion-sidebar p-2 md:hidden">
                <div className="mb-2 rounded-md border border-gray-200 bg-white p-3">
                  <label htmlFor="mobile-user-name" className="mb-1 block text-xs text-gray-500">
                    使用者名稱
                  </label>
                  <input
                    id="mobile-user-name"
                    type="text"
                    value={userName}
                    onChange={(event) => setUserName(event.target.value)}
                    placeholder="請輸入你的名字"
                    className={inputClass}
                  />
                </div>

                <form onSubmit={handleCreateTrip} className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
                  <input
                    type="text"
                    value={newTripName}
                    onChange={(event) => setNewTripName(event.target.value)}
                    placeholder="新增旅程名稱"
                    className={inputClass}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-100"
                  >
                    + 新增旅程
                  </button>
                </form>

                <div className="mt-2 space-y-2">{trips.map((trip) => tripPill(trip))}</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {viewItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setCurrentView(item.key)
                        setOpenMenuId(null)
                      }}
                      className={`rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100 ${
                        currentView === item.key ? 'bg-gray-100 font-medium' : 'bg-white'
                      }`}
                    >
                      {item.emoji} {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedTrip ? (
                <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {selectedTrip.coverImageUrl ? (
                    <ImagePreview
                      src={selectedTrip.coverImageUrl}
                      alt={`${selectedTrip.name} 封面`}
                      className="h-44 w-full border-b border-gray-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center border-b border-gray-200 bg-gray-50 text-sm text-gray-500">
                      尚未設定封面圖片
                    </div>
                  )}

                  <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-8 pt-5 sm:px-8">
                    <div className="w-full max-w-xl">
                      <p className="text-4xl" aria-hidden>
                        旅程
                      </p>
                      <p className="mt-2 text-sm text-gray-500">您好，{userName.trim() || '旅人'}。</p>
                      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{selectedTrip.name}</h1>

                      <div className="mt-4">
                        <ImageInputField
                          id="cover-url"
                          label="封面圖片"
                          value={selectedTrip.coverImageUrl}
                          onChange={handleCoverImageChange}
                        />
                      </div>
                    </div>
                    {renderDeleteMenu(`trip-header-${selectedTrip.id}`, () => handleDeleteTrip(selectedTrip.id))}
                  </div>
                </article>
              ) : (
                <article className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                  先新增第一個旅程開始規劃。
                </article>
              )}

              {selectedTrip && currentView === 'itinerary' && (
                <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">🗓️ 旅遊規劃</h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddDay}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100"
                      >
                        + 新增天數
                      </button>
                      <button
                        type="button"
                        disabled={!activeDay}
                        onClick={() => setIsAddActivityOpen(true)}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        + 新增活動
                      </button>
                    </div>
                  </header>

                  <div className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 pb-4">
                    {selectedTrip.itineraryDays.map((day) => (
                      <div key={day.id} className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDayByTrip((prev) => ({
                              ...prev,
                              [selectedTrip.id]: day.id,
                            }))
                          }
                          className={`rounded px-2 py-1 text-sm transition hover:bg-gray-100 ${
                            day.id === activeDay?.id ? 'bg-gray-100 font-medium' : ''
                          }`}
                        >
                          {day.label}
                        </button>
                        {renderDeleteMenu(
                          `day-${day.id}`,
                          () => handleDeleteDay(day.id),
                          selectedTrip.itineraryDays.length <= 1,
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-gray-500">可拖曳卡片自由調整行程順序。</p>

                    {activeDay?.activities.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                        這一天還沒有活動。
                      </div>
                    )}

                    {activeDay?.activities.map((activity, index) => (
                      <div key={activity.id} className="space-y-2">
                        <div
                          onDragOver={handleDragOver}
                          onDragEnter={() => setDropIndex(index)}
                          onDrop={() => handleDropToIndex(index)}
                          className={`h-2 rounded transition ${
                            dropIndex === index ? 'bg-gray-300' : 'bg-transparent'
                          }`}
                        />

                        <article
                          draggable
                          onDragStart={() => setDraggingActivityId(activity.id)}
                          onDragEnd={() => {
                            setDraggingActivityId(null)
                            setDropIndex(null)
                          }}
                          className="cursor-move rounded-xl border border-gray-200 p-4 transition hover:bg-gray-50"
                        >
                          <div className="grid gap-3 sm:grid-cols-[72px_1fr] sm:items-start">
                            <p className="text-sm font-medium text-gray-500">{activity.time}</p>
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h3 className="text-base font-semibold">{activity.title}</h3>
                                {renderDeleteMenu(`activity-${activity.id}`, () => handleDeleteActivity(activity.id))}
                              </div>
                              <span className="mt-2 inline-block rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                                {categoryText[activity.category]}
                              </span>

                              {activity.imageUrl ? (
                                <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                                  <ImagePreview
                                    src={activity.imageUrl}
                                    alt={activity.title}
                                    className="h-32 w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-5 text-xs text-gray-500">
                                  尚未加入圖片
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      </div>
                    ))}

                    {activeDay && activeDay.activities.length > 0 && (
                      <div
                        onDragOver={handleDragOver}
                        onDragEnter={() => setDropIndex(activeDay.activities.length)}
                        onDrop={() => handleDropToIndex(activeDay.activities.length)}
                        className={`rounded-lg border border-dashed p-3 text-center text-xs transition ${
                          dropIndex === activeDay.activities.length
                            ? 'border-gray-400 bg-gray-50 text-gray-700'
                            : 'border-gray-300 text-gray-500'
                        }`}
                      >
                        拖曳到這裡可放到最後；拖曳到卡片上方可插入任意位置
                      </div>
                    )}
                  </div>
                </article>
              )}

              {selectedTrip && currentView === 'journal' && (
                <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">📓 旅遊心得</h2>
                      <p className="mt-1 text-sm text-gray-500">瀏覽已建立的心得內容。</p>
                    </div>
                  </header>

                  <div className="mt-6 space-y-5">
                    {selectedTrip.journalEntries.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                        目前沒有心得紀錄。
                      </div>
                    )}

                    {selectedTrip.journalEntries.map((entry) => {
                      const segments = getJournalSegments(entry)
                      const images = getJournalImages(entry)

                      return (
                        <article key={entry.id} className="space-y-4 rounded-xl border border-gray-200 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <p className="text-xs uppercase tracking-wide text-gray-500">{entry.createdAt}</p>
                              <h3 className="text-lg font-semibold">{entry.title}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditJournal(entry.id)}
                                className="rounded-md border border-gray-200 px-2.5 py-1 text-xs transition hover:bg-gray-100"
                              >
                                編輯
                              </button>
                              {renderDeleteMenu(`entry-${entry.id}`, () => handleDeleteJournal(entry.id))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            {segments.map((segment) => (
                              <p
                                key={segment.id}
                                className="text-base leading-6 whitespace-pre-wrap"
                                style={{ color: segment.textColor || '#374151' }}
                              >
                                {segment.text}
                              </p>
                            ))}
                          </div>

                          {images.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {images.map((image, index) => (
                                <div key={`${entry.id}-image-${index}`} className="overflow-hidden rounded-xl border border-gray-200">
                                  <ImagePreview
                                    src={image}
                                    alt={`${entry.title} 圖片 ${index + 1}`}
                                    className="h-48 w-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-xs text-gray-500">
                              尚未加入圖片
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </article>
              )}

              {selectedTrip && currentView === 'journalEdit' && (
                <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">✍️ 編輯心得</h2>
                      <p className="mt-1 text-sm text-gray-500">同一篇心得可拆成多段，每段可用不同字體顏色。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetJournalEditor}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100"
                      >
                        {editingJournalId ? '取消編輯' : '清空內容'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentView('journal')}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100"
                      >
                        回到心得列表
                      </button>
                    </div>
                  </header>

                  <form onSubmit={handleAddJournal} className="mt-5 space-y-4 rounded-xl border border-gray-200 p-4">
                    <div className="space-y-1">
                      <label htmlFor="journal-title" className="text-sm text-gray-600">
                        標題
                      </label>
                      <input
                        id="journal-title"
                        type="text"
                        value={journalForm.title}
                        onChange={(event) =>
                          setJournalForm((prev) => ({ ...prev, title: event.target.value }))
                        }
                        placeholder="輸入標題"
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">文字段落</p>
                        <button
                          type="button"
                          onClick={addJournalSegment}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs transition hover:bg-gray-100"
                        >
                          + 新增段落
                        </button>
                      </div>

                      {journalForm.segments.map((segment, index) => (
                        <div key={segment.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-500">段落 {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => removeJournalSegment(segment.id)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs transition hover:bg-gray-100"
                              disabled={journalForm.segments.length <= 1}
                            >
                              刪除段落
                            </button>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-gray-500">字體顏色</label>
                            <input
                              type="color"
                              value={segment.textColor}
                              onChange={(event) =>
                                updateJournalSegment(segment.id, { textColor: event.target.value })
                              }
                              className="h-10 w-full rounded-md border border-gray-300 bg-white p-1"
                            />
                          </div>

                          <textarea
                            rows={4}
                            value={segment.text}
                            onChange={(event) =>
                              updateJournalSegment(segment.id, { text: event.target.value })
                            }
                            placeholder="輸入這一段內容"
                            className={inputClass}
                            style={{ color: segment.textColor }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">文字預覽</p>
                      <div className="mt-2 space-y-2">
                        {journalForm.segments.map((segment) => (
                          <p
                            key={`preview-${segment.id}`}
                            className="text-base leading-6 whitespace-pre-wrap"
                            style={{ color: segment.textColor }}
                          >
                            {segment.text || '（空白段落）'}
                          </p>
                        ))}
                      </div>
                    </div>

                    <MultiImageInputField
                      id="journal-images"
                      label="圖片（可複數）"
                      imageInput={journalForm.imageInput}
                      onImageInputChange={(value) =>
                        setJournalForm((prev) => ({ ...prev, imageInput: value }))
                      }
                      images={journalForm.imageUrls}
                      onImagesChange={(images) =>
                        setJournalForm((prev) => ({ ...prev, imageUrls: images }))
                      }
                    />

                    <button
                      type="submit"
                      className="rounded-md border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-100"
                    >
                      {editingJournalId ? '儲存修改' : '新增紀錄'}
                    </button>
                  </form>
                </article>
              )}

              {selectedTrip && currentView === 'shopping' && (
                <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">🧾 購物清單</h2>
                      <p className="mt-1 text-sm text-gray-500">集中檢視統計與購物項目列表。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentView('shoppingEdit')}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100"
                    >
                      前往編輯購物
                    </button>
                  </header>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">圖表類型</span>
                    {([
                      ['pie', '圓餅圖'],
                      ['donut', '環形圖'],
                      ['bar', '長條圖'],
                    ] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setChartType(type)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition ${
                          chartType === type
                            ? 'border-gray-300 bg-gray-100 font-medium'
                            : 'border-gray-200 bg-white hover:bg-gray-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <ChartView
                      title="全部清單占比（不分是否已購買）"
                      data={allShoppingChartData}
                      chartType={chartType}
                      emptyText="目前沒有可統計資料"
                    />
                    <ChartView
                      title="已購買清單占比"
                      data={purchasedShoppingChartData}
                      chartType={chartType}
                      emptyText="目前沒有已購買項目"
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">總預估</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(shoppingSummary.total)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">已購買</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(shoppingSummary.purchased)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">尚未購買</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(shoppingSummary.remaining)}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {selectedTrip.shoppingItems.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                        尚未新增購物項目。
                      </div>
                    )}

                    {selectedTrip.shoppingItems.map((item) => {
                      const subtotal = item.quantity * item.unitPrice
                      return (
                        <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                          <div className="grid grid-cols-[1fr_120px] items-start gap-3 sm:grid-cols-[1fr_220px]">
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h3 className="text-base font-semibold">{item.name}</h3>
                                  <p className="text-xs text-gray-500">{item.createdAt}</p>
                                </div>
                                {renderDeleteMenu(`shopping-${item.id}`, () => handleDeleteShopping(item.id))}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                                <span className="rounded bg-gray-100 px-2 py-1 text-xs">{item.category}</span>
                                <span>數量：{item.quantity}</span>
                                <span>單價：{formatCurrency(item.unitPrice)}</span>
                                <span>小計：{formatCurrency(subtotal)}</span>
                              </div>

                              {item.note && <p className="mt-2 text-sm text-gray-600">備註：{item.note}</p>}

                              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.purchased}
                                  onChange={() => togglePurchased(item.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-300"
                                />
                                <span className={item.purchased ? 'text-gray-500' : 'text-gray-700'}>
                                  {item.purchased ? '已購買' : '尚未購買'}
                                </span>
                              </label>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-gray-200">
                              {item.imageUrl ? (
                                <ImagePreview
                                  src={item.imageUrl}
                                  alt={`${item.name} 商品圖片`}
                                  className="h-28 w-full object-cover sm:h-36"
                                />
                              ) : (
                                <div className="flex h-28 items-center justify-center bg-gray-50 px-3 text-xs text-gray-500 sm:h-36">
                                  尚未加入商品圖片
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </article>
              )}

              {selectedTrip && currentView === 'shoppingEdit' && (
                <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">🛒 編輯購物清單</h2>
                      <p className="mt-1 text-sm text-gray-500">新增項目、管理類別與商品圖片。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentView('shopping')}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-sm transition hover:bg-gray-100"
                    >
                      回到購物清單
                    </button>
                  </header>

                  <form onSubmit={handleAddShopping} className="mt-5 space-y-4 rounded-xl border border-gray-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="shopping-name" className="mb-1 block text-sm text-gray-600">
                          品項名稱
                        </label>
                        <input
                          id="shopping-name"
                          type="text"
                          value={shoppingForm.name}
                          onChange={(event) =>
                            setShoppingForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          placeholder="例如：抹茶伴手禮"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="shopping-category" className="mb-1 block text-sm text-gray-600">
                          類別
                        </label>
                        <select
                          id="shopping-category"
                          value={shoppingForm.category}
                          onChange={(event) =>
                            setShoppingForm((prev) => ({
                              ...prev,
                              category: event.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          {selectedTrip.shoppingCategories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm text-gray-600">類別管理</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newShoppingCategory}
                          onChange={(event) => setNewShoppingCategory(event.target.value)}
                          placeholder="輸入新類別名稱"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={handleAddShoppingCategory}
                          className="shrink-0 rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-100"
                        >
                          新增類別
                        </button>
                      </div>
                      <div className="space-y-2">
                        {selectedTrip.shoppingCategories.map((category) => (
                          <div
                            key={`category-manage-${category}`}
                            className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2"
                          >
                            <span className="text-sm">{category}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleRenameShoppingCategory(category)}
                                className="rounded-md border border-gray-200 px-2 py-1 text-xs transition hover:bg-gray-100"
                              >
                                重新命名
                              </button>
                              {renderDeleteMenu(
                                `shopping-category-${category}`,
                                () => handleDeleteShoppingCategory(category),
                                category === '其他',
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="shopping-quantity" className="mb-1 block text-sm text-gray-600">
                          數量
                        </label>
                        <input
                          id="shopping-quantity"
                          type="number"
                          min="1"
                          value={shoppingForm.quantity}
                          onChange={(event) =>
                            setShoppingForm((prev) => ({ ...prev, quantity: event.target.value }))
                          }
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="shopping-unit-price" className="mb-1 block text-sm text-gray-600">
                          單價
                        </label>
                        <input
                          id="shopping-unit-price"
                          type="number"
                          min="0"
                          value={shoppingForm.unitPrice}
                          onChange={(event) =>
                            setShoppingForm((prev) => ({ ...prev, unitPrice: event.target.value }))
                          }
                          placeholder="TWD"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="shopping-note" className="mb-1 block text-sm text-gray-600">
                        備註（選填）
                      </label>
                      <input
                        id="shopping-note"
                        type="text"
                        value={shoppingForm.note}
                        onChange={(event) =>
                          setShoppingForm((prev) => ({ ...prev, note: event.target.value }))
                        }
                        placeholder="例如：要免稅包裝"
                        className={inputClass}
                      />
                    </div>

                    <ImageInputField
                      id="shopping-image"
                      label="商品圖片（選填）"
                      value={shoppingForm.imageUrl}
                      onChange={(value) =>
                        setShoppingForm((prev) => ({
                          ...prev,
                          imageUrl: value,
                        }))
                      }
                    />

                    <button
                      type="submit"
                      className="rounded-md border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-100"
                    >
                      新增項目
                    </button>
                  </form>
                </article>
              )}
            </section>

            {selectedTrip && (
              <aside className="w-full space-y-4 lg:sticky lg:top-6 lg:h-fit lg:w-72">
                <article className="rounded-2xl border border-gray-200 bg-white p-5">
                  <h2 className="text-base font-semibold">待辦清單</h2>

                  <form onSubmit={handleAddTodo} className="mt-4 space-y-2">
                    <input
                      type="text"
                      value={todoInput}
                      onChange={(event) => setTodoInput(event.target.value)}
                      placeholder="新增待辦事項"
                      className={inputClass}
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-100"
                    >
                      + 新增 To-do
                    </button>
                  </form>

                  <ul className="mt-4 space-y-3">
                    {selectedTrip.checklist.length === 0 && (
                      <li className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500">
                        目前沒有待辦事項
                      </li>
                    )}
                    {selectedTrip.checklist.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 transition hover:bg-gray-50"
                      >
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => toggleTodo(item.id)}
                            className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-300"
                          />
                          <span className={item.done ? 'text-gray-400 line-through' : 'text-gray-700'}>
                            {item.label}
                          </span>
                        </label>
                        {renderDeleteMenu(`todo-${item.id}`, () => handleDeleteTodo(item.id))}
                      </li>
                    ))}
                  </ul>
                </article>
              </aside>
            )}
          </div>
        </main>
      </div>

      {isAddActivityOpen && selectedTrip && activeDay && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">新增活動 ({activeDay.label})</h3>
              <button
                type="button"
                onClick={() => setIsAddActivityOpen(false)}
                className="rounded-md border border-gray-200 px-2 py-1 text-sm transition hover:bg-gray-100"
              >
                關閉
              </button>
            </div>

            <form onSubmit={handleAddActivity} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="activity-time" className="text-sm text-gray-600">
                  時間
                </label>
                <input
                  id="activity-time"
                  type="time"
                  value={activityForm.time}
                  onChange={(event) =>
                    setActivityForm((prev) => ({ ...prev, time: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="activity-title" className="text-sm text-gray-600">
                  標題
                </label>
                <input
                  id="activity-title"
                  type="text"
                  value={activityForm.title}
                  onChange={(event) =>
                    setActivityForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="例如：東京鐵塔"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="activity-category" className="text-sm text-gray-600">
                  類別
                </label>
                <select
                  id="activity-category"
                  value={activityForm.category}
                  onChange={(event) =>
                    setActivityForm((prev) => ({
                      ...prev,
                      category: event.target.value as ActivityCategory,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="food">美食</option>
                  <option value="spot">景點</option>
                  <option value="transport">交通</option>
                </select>
              </div>

              <ImageInputField
                id="activity-image-url"
                label="圖片"
                value={activityForm.imageUrl}
                onChange={(value) => setActivityForm((prev) => ({ ...prev, imageUrl: value }))}
              />

              <button
                type="submit"
                className="w-full rounded-md border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-100"
              >
                儲存活動
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
