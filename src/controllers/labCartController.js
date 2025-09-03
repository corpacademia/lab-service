const cartServices = require('../services/labCartService')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
const cookie = require('cookie');
const axios = require('axios');
const cartQueries = require('../services/labCartQueries');
const pool = require('../db/dbConfig');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const labQueries = require('../services/labQueries');
const { jsPDF } = require("jspdf"); // if using pdfkit instead, I can rewrite
const {autoTable} = require("jspdf-autotable");
const { send } = require('process');
const { sendNotification } = require('../socket');

// // normalize in case it's wrapped in .default
// if (autoTable.default) {
//   autoTable = autoTable.default;
// }


//get the user name
const getUserData = async(userId,sessionToken)=>{
  try {
    if(!userId){
      throw new Error("Please Provide the user id")
    }
    const getUserData = await axios.post(`${process.env.BACKEND_URL}/api/v1/user_ms/getuserdata/${userId}`,{},{
       headers: {
        Cookie: `session_token=${sessionToken}`
      }
    }
    );
    if(!getUserData.data.response){
      throw new Error("No user is found with this user id");
    }
    return getUserData.data.response.user;
  } catch (error) {
    throw error
  }
}
//create a new cart item
const createCartItem = async (req, res) => {
    try {
        const { labId, name, description, duration, price, quantity,userId } = req.body;
        if (!labId || !name || !price || !userId || !duration || !quantity) {
            return res.status(400).send({ 
               success: false,
               message: 'labId, name, price, userId, duration and quantity are required fields.' 
            });
        }
        const newCartItem = await cartServices.createCartItem(labId, name, description, duration, price, quantity, userId);
        if (!newCartItem) {
            return res.status(404).send({ success: false, message: 'Failed to create cart item.' });
        }

        return res.status(201).send({ success: true, data: newCartItem });
    } catch (error) {
        console.error('Error creating cart item:', error);
        return res.status(500).send({ success: false, message: 'Internal server error.',error: error.message });
    }
}     

//get cart items by user id
const getCartItemsByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) {
            return res.status(400).send({ success: false, message: 'User ID is required.' });
        }
        const cartItems = await cartServices.getCartItemsByUserId(userId);
        if (!cartItems || cartItems.length === 0) {
            return res.status(200).send({ success: true, message: 'No cart items found for this user.', data: [] });
        }
        return res.status(200).send({ success: true,message:"Successfully retrieved cart items", data: cartItems });
    } catch (error) {
        console.error('Error getting cart items:', error);
        return res.status(500).send({ success: false, message: 'Internal server error.', error: error.message });
    }
}

//delete a cart item
const deleteCartItem = async (req, res) => {
    try {
        const cartItemId = req.params.cartItemId;
        if (!cartItemId) {
            return res.status(400).send({ success: false, message: 'Cart item ID is required.' });
        }
        const deletedCartItem = await cartServices.deleteCartItem(cartItemId);
        if (!deletedCartItem) {
            return res.status(404).send({ success: false, message: 'Cart item not found.' });
        }
        return res.status(200).send({ success: true, message: 'Cart item deleted successfully.', data: deletedCartItem });
    } catch (error) {
        console.error('Error deleting cart item:', error);
        return res.status(500).send({ success: false, message: 'Internal server error.', error: error.message });
    }
}

//delete all cart items of a user
const deleteCartItemsOnUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) {
            return res.status(400).send({ success: false, message: 'User ID is required.' });
        }
        const deletedCartItems = await cartServices.deleteCartItemsOnUserId(userId);
        if (!deletedCartItems || deletedCartItems.length === 0) {
            return res.status(404).send({ success: false, message: 'No cart items found for this user.' });
        }
        return res.status(200).send({ success: true, message: 'All cart items deleted successfully.', data: deletedCartItems });
    } catch (error) {
        console.error('Error deleting cart items:', error);
        return res.status(500).send({ success: false, message: 'Internal server error.', error: error.message });
    }
}

//update the cart item
const updateCartItem = async (req, res) => {
    try {
        const { duration, quantity ,defaultDuration,price} = req.body;
        const cartItemId = req.params.cartItemId;
        if (!duration || !quantity || !cartItemId || !price) {
            return res.status(400).send({ success: false, message: 'Duration, quantity,price and cart item ID are required.' });
        }
        let totalPrice;
        if(duration <= defaultDuration){
            totalPrice = quantity * price;
        }
        else{
          totalPrice = (duration/defaultDuration) * quantity * price;
        }
        const updatedCartItem = await cartServices.updateCartItem(duration, quantity,totalPrice, cartItemId);
        if (!updatedCartItem) {
            return res.status(404).send({ success: false, message: 'Cart item not found.' });
        }
        return res.status(200).send({ success: true, message: 'Cart item updated successfully.', data: updatedCartItem });
    } catch (error) {
        console.error('Error updating cart item:', error);
        return res.status(500).send({ success: false, message: 'Internal server error.', error: error.message });
    }
}

const saveCartToDatabase = async (userId, cartItems) => {
  const result = await pool.query(
    cartQueries.INSERT_CART_DETAILS,
    [userId, JSON.stringify(cartItems)]
  );
  return result.rows[0].id;
};

const  generateLabImage = async (
  labName,
  imageName = 'base-image.jpg',
  options 
)=> {
   const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  // Load background or fallback gradient
  const imagePath = path.join(__dirname, imageName);
  if (fs.existsSync(imagePath)) {
    const background = await loadImage(imagePath);
    ctx.drawImage(background, 0, 0, 800, 600);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, '#003366');
    gradient.addColorStop(1, '#00BFFF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 600);
  }

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';

  let y = 40;

  // Category (top-left)
  ctx.textAlign = 'left';
  ctx.font = '16px Arial';
  ctx.fillText(options.category, 30, y);

  // Org Name (centered)
  ctx.textAlign = 'center';
  y += 40;
  ctx.font = 'bold 20px Arial';
  ctx.fillText(options.orgName, 400, y);

  // Title (e.g., "singleVM Catalogue")
  y += 40;
  ctx.font = 'bold 28px Arial';
  ctx.fillText(options.title, 400, y);

  // Lab Name
  y += 50;
  ctx.font = 'bold 32px Arial';
  ctx.fillText(labName, 400, y);

  // Duration
  y += 40;
  ctx.font = '20px Arial';
  ctx.fillText(`Course Duration : ${options.duration}`, 400, y);

  // Yellow box with level
  y += 40;
  const levelText = `Course Level : ${options.level}`;
  ctx.font = '18px Arial';
  const boxWidth = ctx.measureText(levelText).width + 40;
  const boxHeight = 35;
  ctx.fillStyle = '#FFEB3B';
  ctx.fillRect(400 - boxWidth / 2, y, boxWidth, boxHeight);

  ctx.fillStyle = '#000';
  ctx.fillText(levelText, 400, y + 24);

  // "By" Line
  y += 70;
  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.fillText(`by ${options.by}`, 400, y);

  // Save Image
  const fileName = `${labName.replace(/\s+/g, '_')}.png`;
  const outputPath = path.join(__dirname, fileName);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  return `https://04a060b3815a.ngrok-free.app/generated/${fileName}`;
}


const stripeCheckout = async (req, res) => {
  try {
    const { userId, cartItems } = req.body;
    if (!userId || !cartItems || cartItems.length === 0) {
      return res.status(400).send({ success: false, message: 'User ID and cart items are required.' });
    }
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.session_token;
    const user = await getUserData(userId,sessionToken);
    // Save cart and get cart_id
    const cartId = await saveCartToDatabase(userId, cartItems);
    const generatedImageUrls = await Promise.all(
    cartItems.map(item => generateLabImage(item.name, 'template.png',{
   
    category: item.category,
    orgName: 'CorpAcademia iTechnovations',
    duration:item.duration || 'Not specified',
    level: item.level,
    by: item.by,
  
  }))
);
    const line_items = cartItems.map((item,index) => ({
      price_data: {
        currency: 'inr',
        product_data: { name: item.name,images:[generatedImageUrls[index]] },
        unit_amount: Math.round(parseFloat(item.price) * 100),
      },
      quantity: item.quantity,
    }));
    
    const customer = await stripe.customers.create({
      name: user.name,
      email: user.email,
    });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      consent_collection: {
        terms_of_service: 'required',  // <-- this is required
      },
      custom_text: {
        submit: { message: "Access Lab Now" },
        terms_of_service_acceptance: {
          message: "I agree to the Terms of Service"
        }
      },
      success_url: `${process.env.FRONTEND_URL}/dashboard/my-labs`,
      cancel_url: `${process.env.FRONTEND_URL}`,
      client_reference_id: userId, 
      metadata: {
        user_id: userId,
        cart_id: cartId.toString() 
      },
      customer: customer.id,
      allow_promotion_codes: true,
      payment_intent_data: {
        receipt_email: user.email,
        metadata: {
        user_id: userId,
        cart_id: cartId.toString() 
      },
      description: `Purchase of ${cartItems.length} ${cartItems.length > 1 ? 'labs ' :'lab '}by user: ${user.name}`, 
  }
    });
    return res.status(200).send({ success: true, sessionId: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).send({ success: false, message: 'Internal server error.' });
  }
};
//insert payment details and assign the lab to user
const insertPaymentAndAssignLab = async (req, res) => {
  
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (event.type ) {
    case 'checkout.session.completed':
    const session = event.data.object;
  
    const userId = session.metadata.user_id;
    const cartId = session.metadata.cart_id;

    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.session_token;
    const user = await getUserData(userId,sessionToken);
    try {
      await pool.query('BEGIN');
      // Get original cart items from DB
      const cartResult = await pool.query(cartQueries.GET_CART_DATA, [cartId]);
      const cartItems = cartResult.rows[0].cart_data;

      for (const item of cartItems) {
        const {  lab_id, duration,type,user_id ,name,price} = item;
         const deleteCart = await pool.query(cartQueries.DELETE_CARTS,[lab_id,userId]);
        const insertPayment = await pool.query(cartQueries.INSERT_PAYMENT, [
          userId,
          session.id,
          session.payment_intent,
          price,
          session.currency,
          session.payment_status,
          session.customer_details.email,
          lab_id,
          duration
        ]);
        const userSettings = await pool.query(labQueries.GET_USER_NOTIFICATION_SETTINGS, [user_id]);
              if (userSettings.rowCount === 0) continue;
        
              const settings = userSettings.rows[0];
              if (!settings.inappnotifications.includes('payment_received')) continue;
        const insertNotification = await pool.query(labQueries.INSERT_NOTIFICATION,['payment_received','Payment Recieved',`Payment recieved ${session.currency}:${price} from ${session.customer_details.email}`,'medium',user_id,null]);
        if(insertNotification.rows.length > 0){
          const labNotification =  await pool.query(labQueries.INSERT_LAB_NOTIFICATION,[lab_id,'payment_recieved',null,insertNotification.rows[0].id]);
          
          sendNotification({
            userId: user_id,
            notification: insertNotification.rows[0]
          });
        }

        const paymentId = insertPayment.rows[0].id;
        let insertLab;
        if(type === 'cloudslice'){
          insertLab = await pool.query(cartQueries.INSERT_ASSINGLAB_CLOUDSLICE_AWS, [
          lab_id,
          userId,
          duration,
          paymentId,
        ]);
        const userSettings = await pool.query(labQueries.GET_USER_NOTIFICATION_SETTINGS, [user_id]);
              if (userSettings.rowCount === 0) continue;
        
              const settings = userSettings.rows[0];
              if (!settings.inappnotifications.includes('lab_assigned')) continue;
         const insertNotification = await pool.query(labQueries.INSERT_NOTIFICATION,['lab_assigned','Lab Assigned',`${name} lab Assigned to ${user.name} `,'medium',user_id,null]);
        if(insertNotification.rows.length > 0){
          const labNotification =  await pool.query(labQueries.INSERT_LAB_NOTIFICATION,[lab_id,'lab_assigned',null,insertNotification.rows[0].id]);
         
          sendNotification({
            userId: user_id,
            notification:insertNotification.rows[0]
          })
        }
        
        }
        else if(type === 'singlevm-aws'){
          insertLab = await pool.query(cartQueries.INSERT_ASSIGNLAB_SINGLEVM_AWS, [
          lab_id,
          userId,
          paymentId,
          duration,
          
        ]);
          const userSettings = await pool.query(labQueries.GET_USER_NOTIFICATION_SETTINGS, [user_id]);
              if (userSettings.rowCount === 0) continue;
        
              const settings = userSettings.rows[0];
              if (!settings.inappnotifications.includes('lab_assigned')) continue;
         const insertNotification = await pool.query(labQueries.INSERT_NOTIFICATION,['lab_assigned','Lab Assigned',`${name} lab Assigned to ${user.name} `,'medium',user_id,null]);
        if(insertNotification.rows.length > 0){
          const labNotification =  await pool.query(labQueries.INSERT_LAB_NOTIFICATION,[lab_id,'lab_assigned',null,insertNotification.rows[0].id]);
           sendNotification({
            userId: user_id,
            notification:insertNotification.rows[0]
           })
        
        }
        }
      }
      await pool.query("COMMIT");
      return res.status(200).send('Success');
    } catch (err) {
      await pool.query("ROLLBACK")
      console.error('Webhook processing error:', err);
      return res.status(500).send('Internal Server Error');
    }
       break;
    case 'payment_intent.payment_succeeded':
      const paymentIntent = event.data.object;

    // Handle failed payment intent
    console.error('Payment failed:', paymentIntent);
    break;
    default:
      console.log(`Unhandled event type ${event.type}`);
      break;
  }

  return res.status(200).send('Event ignored');
};
//get the transaction details
const getTransactionDetails = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      start_date,
      end_date,
    } = req.query;

    const stripeLimit = parseInt(limit, 10);
    let allPaymentIntents = [];
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
    const params = {
      limit: 100,
      expand: ['data.customer'],
    };

    if (startingAfter) {
      params.starting_after = startingAfter; 
    }

    const response = await stripe.paymentIntents.list(params);

    allPaymentIntents = allPaymentIntents.concat(response.data);
    hasMore = response.has_more;

    if (hasMore) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    }
    // Apply filters
    let filteredIntents = allPaymentIntents;

    if (status) {
      filteredIntents = filteredIntents.filter(pi => pi.status === status);
    }

    if (search) {
      filteredIntents = filteredIntents.filter(pi => {
        const customerName = typeof pi.customer === "object" ? pi.customer?.name : "";
        const customerEmail = typeof pi.customer === "object" ? pi.customer?.email : "";
        return (
          pi.id.includes(search) ||
          customerName?.toLowerCase().includes(search.toLowerCase()) ||
          customerEmail?.toLowerCase().includes(search.toLowerCase())
        );
      });
    }

    if (start_date && end_date) {
      const start = new Date(start_date).getTime() / 1000;
      const end = new Date(end_date).getTime() / 1000;
      filteredIntents = filteredIntents.filter(pi => pi.created >= start && pi.created <= end);
    }

    // Manual pagination
    const startIndex = (page - 1) * stripeLimit;
    const endIndex = startIndex + stripeLimit;
    const paginatedIntents = filteredIntents.slice(startIndex, endIndex);

    // Map to response
      const transactions = await Promise.all(
        paginatedIntents.map(async (pi) => {
          let charge = null;
          let refunds = [];

          if (pi.latest_charge) {
            charge = await stripe.charges.retrieve(pi.latest_charge, {
              expand: ['refunds'],
            });
            refunds = charge.refunds?.data || [];
          }

          // Determine transaction status
          let transactionStatus = pi.status; // default = payment intent status
          if (refunds.length > 0) {
            // Look at the latest refund only
            const latestRefund = refunds[refunds.length - 1];
            transactionStatus = latestRefund.status === "succeeded" ? "refunded" : latestRefund.status;
          }
           // Handle failed payments
          if (charge && charge.status === "failed") {
            transactionStatus = "failed";
          }
          return {
            id: pi.id,
            customer_name: typeof pi.customer === "object" ? pi.customer?.name : null,
            customer_email: typeof pi.customer === "object" ? pi.customer?.email : null,
            amount: pi.amount_received,
            currency: pi.currency.toUpperCase(),
            status: transactionStatus, // 👈 fixed
            created: new Date(pi.created * 1000).toLocaleString(),
            payment_method: pi.payment_method,
            receipt_url: charge?.receipt_url || null,
            refund_details: refunds.map(r => ({
              refund_id: r.id,
              amount: r.amount,
              status: r.status,
              created: new Date(r.created * 1000).toLocaleString(),
            })),
          };
        })
      );

    // Pagination metadata
    const pagination = {
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(filteredIntents.length / stripeLimit),
      totalItems: filteredIntents.length,
      itemsPerPage: stripeLimit,
    };

    return res.status(200).send({
      success: true,
      message: 'Transaction details retrieved successfully.',
      data: transactions,
      pagination,
    });
  } catch (error) {
    console.error('Error getting transaction details:', error);
    return res.status(500).send({
      success: false,
      message: 'Internal server error.',
      error: error.message,
    });
  }
};
const exportTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, start_date, end_date } = req.query;

    const skip = (page - 1) * limit;

    // Build Stripe params (only supported ones)
    let params = { limit: 100 }; // fetch more so filtering works
    if (start_date && end_date) {
      params.created = {
        gte: Math.floor(new Date(start_date).getTime() / 1000),
        lte: Math.floor(new Date(end_date).getTime() / 1000),
      };
    }

    const paymentIntents = await stripe.paymentIntents.list(params);

    // Transform
    let transactions = await Promise.all(
      paymentIntents.data.map(async (pi) => {
        const charge = pi.latest_charge
          ? await stripe.charges.retrieve(pi.latest_charge)
          : null;

        return {
          id: pi.id,
          customer: typeof pi.customer === "object" ? pi.customer?.name : pi.customer,
          amount: (pi.amount_received / 100).toFixed(2),
          currency: pi.currency.toUpperCase(),
          status: pi.status,
          created: new Date(pi.created * 1000).toLocaleString(),
          receipt_url: charge?.receipt_url || "-",
        };
      })
    );

    // Apply backend filters
    if (status) {
      transactions = transactions.filter((t) => t.status === status);
    }
    if (search) {
      transactions = transactions.filter(
        (t) =>
          (t.customer && t.customer.toLowerCase().includes(search.toLowerCase())) ||
          t.id.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Manual pagination
    const paginated = transactions.slice(skip, skip + parseInt(limit));

    // Generate PDF
    const doc = new jsPDF();
    doc.text(`Transactions Report (Page ${page})`, 14, 15);

    autoTable(doc, {
      startY: 25,
      margin: { left: 14, right: 14 },
      tableWidth: "auto",
      head: [["ID", "Customer", "Amount", "Currency", "Status", "Created", "Receipt"]],
      body: paginated.map((t) => [
        t.id,
        t.customer || "-",
        t.amount,
        t.currency,
        t.status,
        t.created,
        "", // empty, link added below
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [52, 73, 94] },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const url = paginated[data.row.index].receipt_url;
          if (url && url !== "-") {
            doc.setTextColor(0, 0, 255);
            doc.textWithLink("View Receipt", data.cell.x + 2, data.cell.y + 6, { url });
            doc.setTextColor(0, 0, 0);
          }
        }
      },
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=transactions.pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Export transactions error:", error);
    res.status(500).json({ error: "Failed to export transactions" });
  }
};
const userTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      start_date,
      end_date,
    } = req.query;
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    const stripeLimit = parseInt(limit, 10);

    // Fetch all PaymentIntents
    let allPaymentIntents = [];
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
    const params = {
      limit: 100,
      expand: ['data.customer'],
    };

    if (startingAfter) {
      params.starting_after = startingAfter; 
    }

    const response = await stripe.paymentIntents.list(params);

    allPaymentIntents = allPaymentIntents.concat(response.data);
    hasMore = response.has_more;

    if (hasMore) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    }
    // Filter by userId in metadata
    let filteredIntents = allPaymentIntents.filter(
      (pi) => pi.metadata?.user_id === userId
    );
    // Extra filters
    if (status) {
      filteredIntents = filteredIntents.filter((pi) => pi.status === status);
    }

    if (search) {
      filteredIntents = filteredIntents.filter((pi) => {
        const customerName =
          typeof pi.customer === "object" ? pi.customer?.name : "";
        const customerEmail =
          typeof pi.customer === "object" ? pi.customer?.email : "";
        return (
          pi.id.includes(search) ||
          customerName?.toLowerCase().includes(search.toLowerCase()) ||
          customerEmail?.toLowerCase().includes(search.toLowerCase())
        );
      });
    }

    if (start_date && end_date) {
      const start = new Date(start_date).getTime() / 1000;
      const end = new Date(end_date).getTime() / 1000;
      filteredIntents = filteredIntents.filter(
        (pi) => pi.created >= start && pi.created <= end
      );
    }

    // Manual pagination
    const startIndex = (page - 1) * stripeLimit;
    const endIndex = startIndex + stripeLimit;
    const paginatedIntents = filteredIntents.slice(startIndex, endIndex);

    // Build transactions with product details
    const transactions = await Promise.all(
      paginatedIntents.map(async (pi) => {
        const charge = pi.latest_charge
          ? await stripe.charges.retrieve(pi.latest_charge,{ expand: ['refunds'] })
          : null;
        //get the refund details
        const refunds = charge?.refunds?.data || [];
        let transactionStatus = pi.status; // default = payment intent status
          if (refunds.length > 0) {
            // Look at the latest refund only
            const latestRefund = refunds[refunds.length - 1];
            transactionStatus = latestRefund.status === "succeeded" ? "refunded" : latestRefund.status;
          }
           // Handle failed payments
        if (charge && charge.status === "failed") {
          transactionStatus = "failed";
        }
        //  Get Checkout Session for this payment intent
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: pi.id,
          expand: ['data.line_items'],
          limit: 1, // only one session per PaymentIntent
        });

        const products =
          sessions.data[0]?.line_items?.data.map((item) => ({
            name: item.description,
            quantity: item.quantity,
            amount_subtotal: item.amount_subtotal,
            amount_total: item.amount_total,
            currency: item.currency,
          })) || [];

        return {
          id: pi.id,
          customer_name:
            typeof pi.customer === "object" ? pi.customer?.name : null,
          customer_email:
            typeof pi.customer === "object" ? pi.customer?.email : null,
          amount: pi.amount_received,
          currency: pi.currency.toUpperCase(),
          status: transactionStatus,
          created: new Date(pi.created * 1000).toLocaleString(),
          payment_method: pi.payment_method,
          receipt_url: charge?.receipt_url || null,
          description: pi.description || "No description provided",
          products, 
        };
      })
    );
    // Pagination metadata
    const pagination = {
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(filteredIntents.length / stripeLimit),
      totalItems: filteredIntents.length,
      itemsPerPage: stripeLimit,
    };

    return res.status(200).send({
      success: true,
      message: "Transaction details retrieved successfully.",
      data: transactions,
      pagination,
    });
  } catch (error) {
    console.error("Error getting transaction details:", error);
    return res.status(500).send({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

module.exports = {
    createCartItem,
    getCartItemsByUserId,
    deleteCartItem,
    updateCartItem,
    deleteCartItemsOnUserId,
    stripeCheckout,
    insertPaymentAndAssignLab,
    getTransactionDetails,
    exportTransactions,
    userTransactions
}