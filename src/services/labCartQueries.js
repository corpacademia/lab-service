module.exports = {
    CREATE_CART_ITEM:`INSERT INTO cart_items (labid,name,description,duration,price,quantity,user_id,defaultduration,defaultprice) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    INSERT_PAYMENT:`INSERT INTO payments (
                    user_id,
                    session_id,
                    payment_intent_id,
                    amount_paid,
                    currency,
                    status,
                    email,
                    labid,
                    duration
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9) RETURNING *`,
    INSERT_ASSIGNLAB_SINGLEVM_AWS:`INSERT INTO singlevm_aws_purchased_labs (labid, user_id, payment_id,  duration) VALUES ($1, $2, $3, $4) RETURNING *`,
    INSERT_ASSINGLAB_CLOUDSLICE_AWS:`INSERT INTO cloudslice_purchased_labs (labid,user_id,duration,payment_id) VALUES($1,$2,$3,$4) RETURNING *`,
    INSERT_CART_DETAILS:`INSERT INTO carts (user_id, cart_data) VALUES ($1, $2) RETURNING id`,

    GET_CART_ITEMS_BY_USER_ID:`SELECT * FROM cart_items WHERE user_id = $1`,
    GET_CART_DATA:`SELECT cart_data FROM carts WHERE id = $1`,

    //remove the cart item
    DELETE_CART_ITEM: `DELETE FROM cart_items WHERE id = $1 RETURNING *`,
    //delete all cart items of a user
    DELETE_CART_ITEMS_ON_USER_ID: `DELETE FROM cart_items WHERE user_id = $1 RETURNING *`,
    DELETE_CARTS:`DELETE FROM cart_items WHERE labid=$1 AND user_id=$2 RETURNING *`,

    //update the cart item
    UPDATE_CART_ITEM:`UPDATE cart_items set duration = $1,quantity = $2,price=$3 where id = $4 RETURNING *`
}