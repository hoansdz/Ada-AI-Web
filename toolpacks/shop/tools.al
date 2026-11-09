data class Product(
    val id: String,
    val name: String,
    val price: Int,
    val stock: Int
)

data class OrderItem(
    val productId: String,
    val productName: String,
    val quantity: Int,
    val price: Int
)

data class Order(
    val id: String,
    val customerId: String,
    val status: String,
    val totalAmount: Int,
    val items: Array<OrderItem>
)

data class Shipment(
    val code: String,
    val orderId: String,
    val carrier: String,
    val status: String,
    val delayed: Bool
)

class Shop {
    @native("shop_search_products")
    private static fun _searchProducts(query: String, limit: Int): Array<Product>

    @native("shop_get_product")
    private static fun _getProduct(id: String): Product?

    @native("shop_list_orders")
    private static fun _listOrders(status: String): Array<Order>

    @native("shop_get_order")
    private static fun _getOrder(id: String): Order?

    static fun searchProducts(query: String, limit: Int = 10): Array<Product> {
        return _searchProducts(query, limit)
    }

    static fun getProduct(id: String): Product? {
        return _getProduct(id)
    }

    static fun listOrders(status: String): Array<Order> {
        return _listOrders(status)
    }

    static fun getOrder(id: String): Order? {
        return _getOrder(id)
    }
}

class shop {
    static fun searchProducts(query: String, limit: Int = 10): Array<Product> {
        return Shop.searchProducts(query, limit)
    }

    static fun getProduct(id: String): Product? {
        return Shop.getProduct(id)
    }

    static fun listOrders(status: String): Array<Order> {
        return Shop.listOrders(status)
    }

    static fun getOrder(id: String): Order? {
        return Shop.getOrder(id)
    }
}

fun listOrders(status: String): Array<Order> {
    return Shop.listOrders(status)
}

class Shipping {
    @native("shipping_track")
    private static fun _track(code: String): Shipment?

    static fun track(code: String): Shipment? {
        return _track(code)
    }
}

class Zalo {
    @native("zalo_send_message")
    private static fun _sendMessage(customerId: String, text: String): Bool

    static fun sendMessage(customerId: String, text: String): Bool {
        return _sendMessage(customerId, text)
    }
}

class Tasks {
    @native("tasks_create")
    private static fun _create(title: String, assignee: String): String

    static fun create(title: String, assignee: String): String {
        return _create(title, assignee)
    }
}
