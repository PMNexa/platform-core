import { defineMessages } from "../../i18n";

/** `DataTable` and `ColumnPicker`'s own chrome. Column headers are the caller's (a schema's labels - data). */
export default defineMessages({
  en: {
    search: "Search",
    searchPlaceholder: "Search…",
    loading: "Loading…",
    allHidden: 'All columns are hidden - use "Columns" to show at least one.',
    noResults: "No results.",
    columns: "Columns",
    moveUp: "Move {name} up",
    moveDown: "Move {name} down",
  },
  vi: {
    search: "Tìm kiếm",
    searchPlaceholder: "Tìm kiếm…",
    loading: "Đang tải…",
    allHidden: 'Tất cả các cột đang bị ẩn - dùng "Cột" để hiện ít nhất một cột.',
    noResults: "Không có kết quả.",
    columns: "Cột",
    moveUp: "Chuyển {name} lên",
    moveDown: "Chuyển {name} xuống",
  },
});
