import { defineMessages } from "../i18n";

export default defineMessages({
  en: {
    title: "Email preferences",
    loading: "Loading…",
    thisEmail: "This email",
    intro:
      "Choose what we email you about. Account emails - confirming your address, resetting your password, security notices - are always sent.",
    accountOnly: "This instance sends account emails only.",
    saved: "Saved.",
    stopped: (v: { label: string }) => `You won't get "${v.label}" emails any more.`,
    unsubscribeFrom: (v: { label: string }) => `Unsubscribe from "${v.label}"`,
    unsubscribed: (v: { label: string }) => `You're unsubscribed from "${v.label}".`,
    unsubscribedAll: "Unsubscribed from everything. You'll still get account emails (password resets and the like).",
    unsubscribeAll: "Unsubscribe from all",
    alwaysSent: "Account emails - confirming your address, password resets, security notices - are always sent.",
  },
  vi: {
    title: "Tùy chọn email",
    loading: "Đang tải…",
    thisEmail: "Email này",
    intro:
      "Chọn những gì bạn muốn nhận qua email. Email tài khoản - xác nhận địa chỉ, đặt lại mật khẩu, thông báo bảo mật - luôn được gửi.",
    accountOnly: "Hệ thống này chỉ gửi email tài khoản.",
    saved: "Đã lưu.",
    stopped: (v: { label: string }) => `Bạn sẽ không nhận email "${v.label}" nữa.`,
    unsubscribeFrom: (v: { label: string }) => `Hủy đăng ký "${v.label}"`,
    unsubscribed: (v: { label: string }) => `Bạn đã hủy đăng ký "${v.label}".`,
    unsubscribedAll: "Đã hủy đăng ký tất cả. Bạn vẫn sẽ nhận email tài khoản (đặt lại mật khẩu và những email tương tự).",
    unsubscribeAll: "Hủy đăng ký tất cả",
    alwaysSent: "Email tài khoản - xác nhận địa chỉ, đặt lại mật khẩu, thông báo bảo mật - luôn được gửi.",
  },
});
