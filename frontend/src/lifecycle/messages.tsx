import type { ReactNode } from "react";
import { defineMessages } from "../i18n";

const lifecycleMessages = defineMessages({
  en: {
    // UserLifecyclePanel
    panelTitle: "Lifecycle email",
    turnedOff: "Turned off:",
    nothingOff: "nothing - every category is on",
    noneYet: "No lifecycle email yet.",
    colWhen: "When",
    colEmail: "Email",
    colThen: "Then",
    holdoutNotSent: "holdout - not sent",
    clicked: "clicked",
    converted: "converted",
    unsubscribed: "unsubscribed",
    // SystemLifecycleScreen
    loading: "Loading…",
    atOnce: "At once",
    afterHours: "+{n}h",
    afterDays: "+{n} days",
    points: (v: { points: string }) => `${v.points} pts`,
    intro: () => (
      <>
        Each step's target action within 72 hours counts as converted. The holdout gets nothing and is measured the same
        way, so <strong>lift</strong> is what the email added.
      </>
    ),
    range: "Range",
    days: "{n} days",
    nothingSent: "Nothing is being sent",
    enrolled: "{now} in it now · {entered} entered in {days} days",
    startsOn: (v: { trigger: ReactNode }) => <>Starts on {v.trigger}</>,
    startsFromScan: "Starts from a scan",
    startsNone: "Starts —",
    colStep: "Step",
    colSent: "Sent",
    colClicked: "Clicked",
    colConverted: "Converted",
    colHoldout: "Holdout conv.",
    colLift: "Lift",
    colUnsubscribed: "Unsubscribed",
    comesBack: "comes back",
    holdoutOf: "{converted} of {total}",
    preview: "Preview",
    footer: (v: { log: ReactNode; suppressed: ReactNode; settings: ReactNode }) => (
      <>
        Every message: {v.log} · Addresses nothing goes to: {v.suppressed} · Settings (cap, quiet hours, holdout):{" "}
        {v.settings}
      </>
    ),
    logLink: "lifecycle email log",
    suppressedLink: "suppressed addresses",
    settingsLink: "System settings",
    // PreviewModal
    sentTo: "Sent to {to}.",
    notSent: "Not sent ({status}): {error}",
    close: "Close",
    sendTest: "Send a test to me",
    userPlaceholder: "Render with a user's data - their id (empty: you)",
    render: "Render",
    skipped:
      "Skipped for this user - the step's condition doesn't hold for them right now (e.g. they already did what it asks).",
    html: "HTML",
    plainText: "Plain text",
    emailPreview: "Email preview",
  },
  vi: {
    panelTitle: "Email vòng đời",
    turnedOff: "Đã tắt:",
    nothingOff: "không có - mọi loại đều đang bật",
    noneYet: "Chưa có email vòng đời nào.",
    colWhen: "Thời điểm",
    colEmail: "Email",
    colThen: "Sau đó",
    holdoutNotSent: "nhóm đối chứng - không gửi",
    clicked: "đã nhấp",
    converted: "đã chuyển đổi",
    unsubscribed: "đã hủy đăng ký",
    loading: "Đang tải…",
    atOnce: "Ngay lập tức",
    afterHours: "+{n} giờ",
    afterDays: "+{n} ngày",
    points: (v: { points: string }) => `${v.points} điểm %`,
    intro: () => (
      <>
        Mỗi bước được tính là chuyển đổi nếu người nhận thực hiện hành động mục tiêu trong vòng 72 giờ. Nhóm đối chứng
        không nhận gì và được đo cùng cách, nên <strong>mức tăng</strong> là phần email đã đóng góp.
      </>
    ),
    range: "Khoảng thời gian",
    days: "{n} ngày",
    nothingSent: "Không có gì đang được gửi",
    enrolled: "{now} người đang trong hành trình · {entered} người tham gia trong {days} ngày",
    startsOn: (v: { trigger: ReactNode }) => <>Bắt đầu khi có {v.trigger}</>,
    startsFromScan: "Bắt đầu từ một lần quét",
    startsNone: "Bắt đầu: —",
    colStep: "Bước",
    colSent: "Đã gửi",
    colClicked: "Đã nhấp",
    colConverted: "Chuyển đổi",
    colHoldout: "Chuyển đổi (đối chứng)",
    colLift: "Mức tăng",
    colUnsubscribed: "Hủy đăng ký",
    comesBack: "quay lại",
    holdoutOf: "{converted} / {total}",
    preview: "Xem trước",
    footer: (v: { log: ReactNode; suppressed: ReactNode; settings: ReactNode }) => (
      <>
        Mọi thư: {v.log} · Địa chỉ không bao giờ nhận thư: {v.suppressed} · Cài đặt (giới hạn, giờ yên lặng, nhóm đối
        chứng): {v.settings}
      </>
    ),
    logLink: "nhật ký email vòng đời",
    suppressedLink: "địa chỉ bị chặn",
    settingsLink: "Cài đặt hệ thống",
    sentTo: "Đã gửi tới {to}.",
    notSent: "Chưa gửi ({status}): {error}",
    close: "Đóng",
    sendTest: "Gửi thử cho tôi",
    userPlaceholder: "Hiển thị với dữ liệu của một người dùng - nhập id (để trống: bạn)",
    render: "Hiển thị",
    skipped:
      "Bỏ qua với người dùng này - điều kiện của bước hiện không đúng với họ (ví dụ: họ đã làm điều bước này yêu cầu).",
    html: "HTML",
    plainText: "Văn bản thuần",
    emailPreview: "Xem trước email",
  },
});

export default lifecycleMessages;
