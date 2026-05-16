import type { UniverWorkbookData } from '@ensemble-sheets/core'

/**
 * 构造演示用的小工作簿。B 列填的是「查看者不该看到」的内容（查看者会被服务端 mask 成 ***），
 * 让权限+脱敏的演示一打开就直观。
 */
export function makeSeedWorkbook(title: string): UniverWorkbookData {
  const sheetId = 'sheet-0-grades'
  const cellData: UniverWorkbookData['sheets'][string]['cellData'] = {}
  const rows: Array<[string, string, string | number]> = [
    ['姓名', '机密备注（B 列）', '分数'],
    ['张伟', '家长申请了个性化教学方案', 92],
    ['王芳', '下学期转学', 78],
    ['李娜', '在领助学金', 85],
    ['赵磊', '特殊饮食 — 花生过敏', 95],
    ['孙静', '近期家中丧亲', 71],
  ]
  rows.forEach((row, r) => {
    const rowData: Record<string, { v?: unknown }> = {}
    row.forEach((v, c) => {
      rowData[String(c)] = { v }
    })
    cellData[String(r)] = rowData
  })
  return {
    id: `seed-${title.replace(/\s+/g, '-').toLowerCase()}`,
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: { id: sheetId, name: title, cellData },
    },
  }
}
