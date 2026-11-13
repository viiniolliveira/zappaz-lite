import portuguese from 'emoji-picker-react/data/emojis-pt'
import * as Picker from 'emoji-picker-react/primitives'

export default function EmojiPickerPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <Picker.Root
      appearance="default"
      cssLayer="epr"
      emojiData={portuguese}
      emojiStyle="native"
      suggestedEmojisMode="recent"
      categories={[
        { category: Picker.Categories.SUGGESTED, name: 'Recentes' },
        { category: Picker.Categories.SMILEYS_PEOPLE, name: 'Smileys e pessoas' },
        { category: Picker.Categories.ANIMALS_NATURE, name: 'Animais e natureza' },
        { category: Picker.Categories.FOOD_DRINK, name: 'Comidas e bebidas' },
        { category: Picker.Categories.TRAVEL_PLACES, name: 'Viagens e lugares' },
        { category: Picker.Categories.ACTIVITIES, name: 'Atividades' },
        { category: Picker.Categories.OBJECTS, name: 'Objetos' },
        { category: Picker.Categories.SYMBOLS, name: 'Símbolos' },
        { category: Picker.Categories.FLAGS, name: 'Bandeiras' },
      ]}
      onEmojiClick={(data) => onSelect(data.emoji)}
      labels={{
        searchPlaceholder: 'Pesquisar emoji',
        searchLabel: 'Pesquisar emoji',
        searchClear: 'Limpar pesquisa',
        searchResultsNone: 'Nenhum emoji encontrado',
        searchResultsOne: '1 emoji encontrado',
        searchResultsMany: '%n emojis encontrados',
        categoryNavigation: 'Categorias de emojis',
        loading: 'Carregando emojis…',
        loadingError: 'Não foi possível carregar os emojis',
        retryLoading: 'Tentar novamente',
        skinToneNeutral: 'Tom de pele padrão',
        skinToneLight: 'Tom de pele claro',
        skinToneMediumLight: 'Tom de pele médio-claro',
        skinToneMedium: 'Tom de pele médio',
        skinToneMediumDark: 'Tom de pele médio-escuro',
        skinToneDark: 'Tom de pele escuro',
      }}
      className="h-full w-full rounded-lg border-0 font-sans [--epr-bg-color:var(--popover)] [--epr-category-icon-active-color:var(--primary)] [--epr-category-icon-inactive-color:var(--muted-foreground)] [--epr-category-label-bg-color:var(--popover)] [--epr-category-label-text-color:var(--muted-foreground)] [--epr-emoji-size:30px] [--epr-focus-bg-color:var(--accent)] [--epr-font-family:var(--font-sans)] [--epr-highlight-color:var(--primary)] [--epr-hover-bg-color:var(--accent)] [--epr-picker-border-color:var(--border)] [--epr-picker-border-radius:var(--radius)] [--epr-search-border-color-active:var(--ring)] [--epr-search-border-color:var(--input)] [--epr-search-icon-color:var(--muted-foreground)] [--epr-search-input-bg-color-active:var(--background)] [--epr-search-input-bg-color:var(--background)] [--epr-search-input-border-radius:var(--radius)] [--epr-search-input-placeholder-color:var(--muted-foreground)] [--epr-search-input-text-color:var(--foreground)] [--epr-skin-tone-picker-menu-color:var(--popover)] [--epr-text-color:var(--foreground)] [&_[data-epr-part=category-label]]:text-xs [&_[data-epr-part=category-label]]:font-medium [&_[data-epr-part=category-label]]:normal-case [&_[data-epr-part=search-input]]:font-sans [&_[data-epr-part=search-input]]:text-sm [&_[data-epr-part=search]]:px-1 [&_[data-epr-part=search]]:pb-1"
    >
      <Picker.CategoryNav />
      <Picker.Search />
      <Picker.Viewport>
        <Picker.List />
        <Picker.Empty />
        <Picker.Loading />
        <Picker.LoadError />
      </Picker.Viewport>
    </Picker.Root>
  )
}
