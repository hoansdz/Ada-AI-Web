import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { runCode } from '../src/lib/runner'
import { getToolpack } from '../src/lib/toolpacks'

describe('AutoLang Runner Tests', () => {
  const shopToolpack = getToolpack('shop')

  test('Toolpack shop được nạp đầy đủ thông tin và mã băm SHA-256', () => {
    assert.ok(shopToolpack !== null, 'Toolpack shop phải tồn tại')
    assert.strictEqual(shopToolpack.name, 'shop')
    assert.strictEqual(shopToolpack.library, 'tools/shop')
    assert.ok(shopToolpack.sha256.length === 64, 'Mã băm SHA-256 phải đủ 64 ký tự hex')
    assert.ok(Object.keys(shopToolpack.natives).length > 0, 'Phải có các hàm native')
  })

  test('Runner thực thi mã gọi Shop.listOrders("shipping") và in số lượng chính xác', async () => {
    assert.ok(shopToolpack !== null)
    const code = `
      val orders = Shop.listOrders("shipping")
      println(orders.length())
    `

    const result = await runCode(code, shopToolpack)
    assert.strictEqual(result.status, 'ok', 'Trạng thái chạy phải thành công')
    assert.strictEqual(result.stdout.trim(), '4', 'Đầu ra stdout phải bằng 4')
    assert.strictEqual(result.tool_calls.length, 1, 'Phải ghi nhận đúng 1 lượt gọi tool')
    assert.strictEqual(result.tool_calls[0].tool, 'shop_list_orders')
    assert.strictEqual(result.tool_calls[0].effect, false, 'listOrders không có tác dụng phụ')
    assert.strictEqual(result.error, null)
  })

  test('Runner thực thi gọi Zalo.sendMessage và ghi nhận tác dụng phụ', async () => {
    assert.ok(shopToolpack !== null)
    const code = `
      Zalo.sendMessage("C001", "Don hang da gui")
      Zalo.sendMessage("C002", "Don hang dang tren duong")
    `

    const result = await runCode(code, shopToolpack)
    assert.strictEqual(result.status, 'ok')
    assert.strictEqual(result.tool_calls.length, 2, 'Phải ghi nhận đúng 2 lượt gọi')
    assert.strictEqual(result.tool_calls[0].tool, 'zalo_send_message')
    assert.strictEqual(result.tool_calls[0].effect, true, 'zalo_send_message có tác dụng phụ')
    assert.strictEqual(result.tool_calls[1].tool, 'zalo_send_message')
    assert.strictEqual(result.tool_calls[1].effect, true)
  })

  test('Runner xử lý lỗi cú pháp và trả về trạng thái compile_error', async () => {
    const invalidCode = `
      val x = ;;;
    `

    const result = await runCode(invalidCode, null)
    assert.strictEqual(result.status, 'compile_error', 'Phải bắt được lỗi biên dịch')
    assert.ok(result.error !== null && result.error.length > 0, 'Phải có thông điệp lỗi biên dịch')
  })

  test('Runner có cơ chế bảo vệ ngắt vòng lặp vô tận (timeout)', async () => {
    const infiniteLoopCode = `
      var i = 0
      while (true) {
        i = i + 1
      }
    `

    const result = await runCode(infiniteLoopCode, null)
    assert.strictEqual(result.status, 'timeout', 'Phải dừng lại do quá thời gian quy định')
  })
})
