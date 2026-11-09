import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { taskStore } from '../src/lib/store'
import { taskQueue } from '../src/lib/queue'

describe('AutoLang TaskStore & TaskQueue Tests', () => {
  const testConvId1 = `conv_test_${Date.now()}_1`
  const testConvId2 = `conv_test_${Date.now()}_2`

  beforeEach(() => {
    // Dọn dẹp các hội thoại thử nghiệm trước khi chạy
    taskStore.deleteConversation(testConvId1)
    taskStore.deleteConversation(testConvId2)
  })

  test('Tạo tác vụ mới yêu cầu đầy đủ conversation_id và nội dung text', () => {
    const task = taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Đếm số đơn đang giao',
      toolpack: 'shop',
      run: true,
    })

    assert.ok(task.id.startsWith('task_'))
    assert.strictEqual(task.conversation_id, testConvId1)
    assert.strictEqual(task.text, 'Đếm số đơn đang giao')
    assert.strictEqual(task.toolpack, 'shop')
    assert.strictEqual(task.run, true)
    assert.strictEqual(task.status, 'queued')
  })

  test('Lọc danh sách tác vụ theo conversation_id riêng biệt', () => {
    taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Tác vụ 1 của hội thoại 1',
    })
    taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Tác vụ 2 của hội thoại 1',
    })
    taskStore.createTask({
      conversation_id: testConvId2,
      text: 'Tác vụ duy nhất của hội thoại 2',
    })

    const tasksConv1 = taskStore.listTasks(testConvId1)
    const tasksConv2 = taskStore.listTasks(testConvId2)

    assert.strictEqual(tasksConv1.length, 2, 'Hội thoại 1 phải có đúng 2 tác vụ')
    assert.strictEqual(tasksConv2.length, 1, 'Hội thoại 2 phải có đúng 1 tác vụ')
    assert.strictEqual(tasksConv1[0].text, 'Tác vụ 1 của hội thoại 1')
    assert.strictEqual(tasksConv1[1].text, 'Tác vụ 2 của hội thoại 1')
    assert.strictEqual(tasksConv2[0].text, 'Tác vụ duy nhất của hội thoại 2')
  })

  test('Gom nhóm danh sách hội thoại có tiêu đề và số lượng tác vụ chính xác', () => {
    taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Kiểm tra tồn kho các mặt hàng quạt điện',
    })
    taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Gửi tin nhắn thông báo cho khách',
    })

    const conversations = taskStore.listConversations()
    const target = conversations.find((c) => c.id === testConvId1)

    assert.ok(target !== undefined, 'Hội thoại phải xuất hiện trong danh sách tổng')
    assert.strictEqual(target.id, testConvId1)
    assert.strictEqual(target.title, 'Kiểm tra tồn kho các mặt hàng quạt điện')
    assert.strictEqual(target.task_count, 2)
  })

  test('Hàng đợi TaskQueue xử lý tác vụ tuần tự tới trạng thái hoàn thành', async () => {
    const task = taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Đếm số lượng đơn hàng đang có trạng thái vận chuyển shipping',
      toolpack: 'shop',
      run: true,
    })

    assert.strictEqual(task.status, 'queued')

    taskQueue.trigger()
    await taskQueue.waitForIdle(20000)

    const updated = taskStore.getTask(task.id)
    assert.ok(updated !== null)
    assert.strictEqual(updated.status, 'done', 'Tác vụ phải hoàn tất thành công')
    assert.ok(updated.code !== undefined && updated.code.length > 0, 'Phải có mã AutoLang đã sinh')
    assert.ok(updated.run_result !== undefined, 'Phải có kết quả thực thi')
    assert.strictEqual(updated.run_result.stdout.trim(), '4', 'Kết quả đếm phải bằng 4')
  })

  test('Xóa an toàn toàn bộ tác vụ của một cuộc hội thoại', () => {
    taskStore.createTask({
      conversation_id: testConvId1,
      text: 'Tác vụ sẽ bị xóa',
    })

    const deleteRes = taskStore.deleteConversation(testConvId1)
    assert.strictEqual(deleteRes.ok, true)

    const remainingTasks = taskStore.listTasks(testConvId1)
    assert.strictEqual(remainingTasks.length, 0, 'Không còn tác vụ nào sau khi xóa hội thoại')
  })
})
