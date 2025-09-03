const cartQueries = require('../services/labCartQueries');


const pool = require('../db/dbConfig');

const createCartItem = async (labId, name, description, duration, price, quantity, userId) => {
    try {
        const result = await pool.query(cartQueries.CREATE_CART_ITEM, [labId, name, description, duration, price, quantity, userId,duration,price]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating cart item:', error);
        throw error;
    }
}

const getCartItemsByUserId = async (userId) => {
    try {
        const result = await pool.query(cartQueries.GET_CART_ITEMS_BY_USER_ID, [userId]);
        return result.rows;
    } catch (error) {
        console.error('Error getting cart items by user ID:', error);
        throw error;
    }
}

//remove the cart item
const deleteCartItem = async (cartItemId) => {
    try {
        const result = await pool.query(cartQueries.DELETE_CART_ITEM, [cartItemId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error deleting cart item:', error);
        throw error;
    }
}

//delete all cart items of a user
const deleteCartItemsOnUserId = async (userId) => {
    try {
        const result = await pool.query(cartQueries.DELETE_CART_ITEMS_ON_USER_ID, [userId]);
        return result.rows;
    } catch (error) {
        console.error('Error deleting cart items for user:', error);
        throw error;
    }
}

//update the cart item
const updateCartItem = async (duration, quantity,price, cartItemId) => {
    try {
        const result = await pool.query(cartQueries.UPDATE_CART_ITEM, [duration, quantity,price, cartItemId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error updating cart item:', error);
        throw error;
    }
}



module.exports = {
    createCartItem,
    getCartItemsByUserId,
    deleteCartItem,
    deleteCartItemsOnUserId,
    updateCartItem,
};