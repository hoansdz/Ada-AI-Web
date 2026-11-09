import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { taskStore } from '../src/lib/store'
import { taskQueue } from '../src/lib/queue'
import { runCode } from '../src/lib/runner'
import { getToolpack } from '../src/lib/toolpacks'

interface AdaChatMessage {
  role: 'user' | 'assistant'
  content: string
}

describe('Parallel Engines & History Separation Tests', () => {
  test('Thực thi song song: Trợ lý Ada AI và Trợ lý AutoLang AI chạy đồng thời độc lập', async () => {
    const adaConversationId = `ada_conv_${Date.now()}`
    const autolangConversationId = `autolang_conv_${Date.now()}`

    // Giả lập cuộc trò chuyện của Ada AI
    const adaChatFlow = async (): Promise<AdaChatMessage[]> => {
      const messages: AdaChatMessage[] = [
        { role: 'user', content: 'Xin chào, bạn có thể tư vấn chính sách đổi trả hàng không?' },
      ]
      // Giả lập phản hồi từ dịch vụ Ada AI
      const simulatedReply = 'Xin chào quý khách! Cửa hàng hỗ trợ đổi trả miễn phí trong vòng 7 ngày kể từ khi nhận hàng.'
      messages.push({ role: 'assistant', content: simulatedReply })
      return messages
    }

    // Luồng thực thi tác vụ của AutoLang AI
    const autolangTaskFlow = async (): Promise<string> => {
      const task = taskStore.createTask({
        conversation_id: autolangConversationId,
        text: 'Đếm số lượng đơn hàng đang có trạng thái vận chuyển shipping',
        toolpack: 'shop',
        run: true,
      })

      taskQueue.trigger()
      await taskQueue.waitForIdle(20000)

      const updated = taskStore.getTask(task.id)
      return updated?.run_result?.stdout.trim() ?? ''
    }

    // Chạy song song cả hai luồng bằng Promise.all
    const [adaHistory, autolangResult] = await Promise.all([
      adaChatFlow(),
      autolangTaskFlow(),
    ])

    // Kiểm chứng kết quả của Ada AI
    assert.strictEqual(adaHistory.length, 2, 'Ada AI phải có đủ 2 tin nhắn hỏi - đáp')
    assert.ok(adaHistory[1].content.includes('đổi trả miễn phí'), 'Nội dung phản hồi của Ada AI phải chuẩn xác')

    // Kiểm chứng kết quả của AutoLang AI
    assert.strictEqual(autolangResult, '4', 'AutoLang AI phải thực thi thành công trả về kết quả 4')

    // Dọn dẹp tác vụ thử nghiệm
    taskStore.deleteConversation(autolangConversationId)
  })

  test('Tách biệt hoàn toàn lịch sử giữa hai hệ thống', async () => {
    const adaConvId = `hist_ada_${Date.now()}`
    const autolangConvId = `hist_autolang_${Date.now()}`

    // 1. Tạo lịch sử cho AutoLang
    taskStore.createTask({
      conversation_id: autolangConvId,
      text: 'Tìm kiếm sản phẩm áo khoác',
      toolpack: 'shop',
    })

    // 2. Kiểm tra danh sách hội thoại của AutoLang Store
    const autolangConversations = taskStore.listConversations()
    const foundAutoLang = autolangConversations.find((c) => c.id === autolangConvId)
    const foundAda = autolangConversations.find((c) => c.id === adaConvId)

    assert.ok(foundAutoLang !== undefined, 'Hội thoại AutoLang phải được lưu trữ trong danh mục AutoLang')
    assert.strictEqual(foundAda, undefined, 'Hội thoại Ada AI không bị lưu nhầm vào danh mục AutoLang')

    // 3. Dọn dẹp
    taskStore.deleteConversation(autolangConvId)
  })

  test('Kiểm tra compiler và native toolpack shop độc lập', async () => {
    const pack = getToolpack('shop')
    assert.ok(pack !== null)

    const code = `
      val prods = Shop.searchProducts("bàn phím")
      println(prods.length())
    `

    const result = await runCode(code, pack)
    assert.strictEqual(result.status, 'ok')
    assert.strictEqual(result.stdout.trim(), '2', 'Số lượng sản phẩm bàn phím tìm thấy phải bằng 2')
    assert.strictEqual(result.tool_calls.length, 1)
    assert.strictEqual(result.tool_calls[0].tool, 'shop_search_products')
  })
})
