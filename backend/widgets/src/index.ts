import { ChatDropinUI } from './chat/ChatWidget';
import { SearchDropinUI } from './search/SearchWidget';

declare global {
  interface Window {
    ChatDropinUI?: typeof ChatDropinUI;
    SearchDropinUI?: typeof SearchDropinUI;
  }
}

if (typeof window !== 'undefined') {
  window.ChatDropinUI = ChatDropinUI;
  window.SearchDropinUI = SearchDropinUI;
}

export { ChatDropinUI, SearchDropinUI };
