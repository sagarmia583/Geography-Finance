const scriptUrl =
  "https://script.google.com/macros/s/AKfycbx5QfSPC4oYlrc_1ykHESKc1sW2Y32jvMUugN3pFMw_D0GAPBOUpD90DlFiKixxkKy-/exec";
const sheetId = "12jwGEEMkGD30FGppS9giFt5H6jb9kAaPJugnCyJYwBw";

const payload = {
  action: "saveVoucher",
  id: sheetId,
  voucherId: "test-123",
  configName: "Test Config",
  examName: "Test Exam",
  date: "2026-08-08",
  income: 1000,
  expenses: 500,
  distributable: 500,
  fullState: "{}",
};

fetch(scriptUrl, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify(payload),
})
  .then((res) => res.text())
  .then((text) => console.log("Response:", text))
  .catch((err) => console.error("Error:", err));
