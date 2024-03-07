import { query, update, text, Record, StableBTreeMap, Variant, Vec, None, Some, Ok, Err, ic, Principal, Opt, nat64, Result, bool } from "azle";
import { Ledger } from "azle/canisters/ledger";
import { hashCode } from "hashcode";
// Define the Product record type
const Product = Record({
    id: text,
    title: text,
    description: text,
    location: text,
    price: nat64,
    seller: Principal,
    attachmentURL: text,
    soldAmount: nat64
});
// Define the ProductPayload record type
const ProductPayload = Record({
    title: text,
    description: text,
    location: text,
    price: nat64,
    attachmentURL: text
});
// Define the OrderStatus variant
const OrderStatus = Variant({
    PaymentPending: text,
    Completed: text
});
// Define the Order record
const Order = Record({
    productId: text,
    price: nat64,
    status: OrderStatus,
    seller: Principal,
    paid_at_block: Opt(nat64),
    memo: nat64
});
// Define the Message variant
const Message = Variant({
    NotFound: text,
    InvalidPayload: text,
    PaymentFailed: text,
    PaymentCompleted: text
});
// Initialize StableBTreeMap instances
const persistedOrders = StableBTreeMap(1);
const pendingOrders =  StableBTreeMap(2);
// Define the reservation period for orders in seconds
const ORDER_RESERVATION_PERIOD_SECONDS = BigInt(120);
// Initialization of the Ledger canister
const icpCanister =  Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));
// Assuming productsStorage is a StableBTreeMap instance of type string, Product
const productsStorage =  StableBTreeMap(0);
// Implement the getProducts query function
const getProducts = query([], Vec(Product), () => {
    const keys = productsStorage.keys();
    const products = keys.map(key => productsStorage.get(key));
    // Filter out undefined values (optional)
    const validProducts = products.filter((product) => product !== undefined);
    // Extract the Some value from Opt<...> objects
    const extractedProducts = validProducts.map((productOpt) => productOpt.Some);
    return extractedProducts;
});

// Update the createOrder function
const createOrder = update([text], Result(Order, Message), (id) => {
    const productOpt = productsStorage.get(id);
    if (productOpt === undefined) {
        return Err({ NotFound: `cannot create the order: product=${id} not found` });
    }
    const product = productOpt.Some; // Access the inner value
    const order = {
        productId: product.id,
        price: product.price,
        status: { PaymentPending: "PAYMENT_PENDING" },
        seller: product.seller,
        paid_at_block: None,
        memo: generateCorrelationId(id)
    };
    pendingOrders.insert(order.memo, order);
    discardByTimeout(order.memo, ORDER_RESERVATION_PERIOD_SECONDS);
    return Ok(order);
});

const completePurchase = update([Principal, text, nat64, nat64, nat64], Result(Order, Message), async (seller, id, price, block, memo) => {
    const paymentVerified = await verifyPaymentInternal(seller, price, block, memo);
    if (!paymentVerified) {
        return Err({ NotFound: `cannot complete the purchase: cannot verify the payment, memo=${memo}` });
    }
    const pendingOrderOpt = pendingOrders.remove(memo);
    if (pendingOrderOpt === undefined) {
        return Err({ NotFound: `cannot complete the purchase: there is no pending order with id=${id}` });
    }
    const order = pendingOrderOpt.Some; // Access the inner value
    const updatedOrder = {
        ...order,
        status: { Completed: "COMPLETED" },
        paid_at_block: Some(block)
    };
    const productOpt = productsStorage.get(id);
    if (productOpt === undefined) {
        throw Error(`product with id=${id} not found`);
    }
    const product = productOpt.Some; // Access the inner value
    product.soldAmount += 1n;
    productsStorage.insert(product.id, product); // Now we can access product.id
    persistedOrders.insert(ic.caller(), updatedOrder);
    return Ok(updatedOrder);
});

// Define the verifyPayment query function
// Define the verifyPayment query function
const verifyPayment = query([Principal, nat64, nat64, nat64], bool, async (receiver, amount, block, memo) => {
    return await verifyPaymentInternal(receiver, amount, block, memo);
});

// Define the makePayment update function
const makePayment = update([text, nat64], Result(Message, Message), async (to, amount) => {
    try {
        // Your payment implementation here
        // For example:
        // await performPayment(to, amount);
        
        // If payment is successful, return a Result with PaymentCompleted variant
        return Ok({ PaymentCompleted: "payment completed" });
    } catch (error) {
        // If payment fails, return a Result with PaymentFailed variant
        return Err({ PaymentFailed: `payment failed: ${error.message}` });
    }
});

// Function to generate hash
function hash(input) {
    return BigInt(Math.abs(hashCode().value(input)));
}

// A workaround to make uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
    getRandomValues: () => {
        let array = new Uint8Array(32);
        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return array;
    }
};

// Function to generate correlation id
function generateCorrelationId(productId) {
    const correlationId = `${productId}_${ic.caller().toText()}_${ic.time()}`;
    return hash(correlationId);
}

// Function to discard orders by timeout
function discardByTimeout(memo, delay) {
    ic.setTimer(delay, () => {
        const order = pendingOrders.remove(memo);
        console.log(`Order discarded ${order}`);
    });
}

// Function to verify payment internally
async function verifyPaymentInternal(receiver, amount, block, memo) {
    // Your payment verification implementation here
    // For example:
    // const paymentVerified = await performPaymentVerification(receiver, amount, block, memo);
    // return paymentVerified;

    // For demonstration purposes, always returning true
    return true;
}
