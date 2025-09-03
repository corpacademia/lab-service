const { toZonedTime, fromZonedTime } = require('date-fns-tz');
const queries = require('../services/labQueries');
const pool = require('../db/dbConfig');
/** Return a Date in user's timezone */
 const nowInTz =  (tz = 'UTC') =>{
  const now = new Date();
  return toZonedTime(now, tz);
}

/** Check if localTime is within quiet hours (quietStart/quietEnd as 'HH:mm') */
 const isWithinQuietHours = async (localTime, quietStart, quietEnd)=> {
  if (!quietStart || !quietEnd) return false;

  const [qsH, qsM] = quietStart.split(':').map(Number);
  const [qeH, qeM] = quietEnd.split(':').map(Number);

  const start = new Date(localTime);
  start.setHours(qsH, qsM, 0, 0);
  const end = new Date(localTime);
  end.setHours(qeH, qeM, 0, 0);

  // span crosses midnight?
  if (start <= end) {
    return localTime >= start && localTime < end;
  } else {
    return localTime >= start || localTime < end;
  }
}

const markEmailAsSent = async (notificationId) => {
    try {
        if (!notificationId) throw new Error('Notification ID is required');
        const result = await pool.query(queries.UPDATE_EMAIL_SENT_STATUS, [notificationId]);
        if (result.rows.length === 0) {
            throw new Error('Notification not found');
        }
        // Email marked as sent successfully
        return true;
    } catch (error) {
        console.error('Error marking email as sent:', error);
        throw error;
    }
}

const fetchAllUsersSettings = async () =>{
    try {
        const result = await pool.query(queries.GET_NOTIFICATION_PREFERENCES_USERS);
        return result.rows;
    } catch (error) {
        console.error('Error fetching user notification settings:', error);
        throw error;
    }
}

const fetchPendingNotificationsForUser = async(userId)=>{
    try {
        const result = await pool.query(queries.GET_PENDING_NOTIFICATIONS_FOR_USER, [userId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching pending notifications for user:', error);
        throw error;
    }
}

const getUserEmail = async(userId) =>{
    try {
        const organizationResult = await pool.query(queries.GET_ORG_USER, [userId]);
        if (organizationResult.rows.length > 0) {
            return organizationResult.rows[0].email;
        }
        const userResult = await pool.query(queries.GET_USER, [userId]);
        if (userResult.rows.length > 0) {
            return userResult.rows[0].email;
        }
    } catch (error) {
        console.error('Error fetching user email:', error);
        throw error;
        
    }
}

const emailPlacehoders = async(p,labId,email)=>{
    try {  
        if(!labId) throw new Error('Lab ID is required for email placeholders');
               const getLabDetails = await pool.query(queries.GET_LAB_DETAILS,[labId]);
                if(getLabDetails.rows.length === 0) throw new Error('Lab not found');
                const lab = getLabDetails.rows[0];
              const placeholder = {
            title: p.type === 'software_expiry'
                ? "Software Expiry Notification"
                : p.type === 'lab_assigned'
                ? "Lab Assigned Notification"
                : p.type === 'payment_recieved'
                    ? "Payment Received Notification"
                    : "Notification",

            priority: "medium",
            icon: "https://example.com/icon.png",

            message: p.type === 'software_expiry'
                ? `Software for the ${lab.cataloguename} is about to expire`
                : p.type === 'lab_assigned'
                ? `Lab ${lab.cataloguename} has been assigned`
                : p.type === 'payment_recieved'
                    ? `Payment received for ${lab.cataloguename} from ${email}`
                    : `Notification for ${lab.cataloguename}`,

            metadata: { 
                labId: lab?.lab_id,
            },

            actionUrl: "https://example.com/renew",
            actionText: p.type === 'software_expiry'
                ? "Renew Now"
                : p.type === 'lab_assigned'
                ? "View Lab"
                : p.type === 'payment_recieved'
                    ? "View Payment"
                    : "View Notification",

            formattedDate: new Date().toLocaleString(),

            notificationType: p.type === 'software_expiry'
                ? "Software Expiry Notification"
                : p.type === 'lab_assigned'
                ? "Lab Assigned Notification"
                : p.type === 'payment_recieved'
                    ? "Payment Received Notification"
                    : "Notification",

            unsubscribeUrl: "https://example.com/unsubscribe",
            preferencesUrl: "https://example.com/preferences",
            email: email,
            };

            return placeholder;
    } catch (error) {
        console.error('Error producing the email placeholder:', error);
        throw error;
    }
}

module.exports = { 
     nowInTz,
     isWithinQuietHours,
     markEmailAsSent,
     fetchAllUsersSettings,
     fetchPendingNotificationsForUser,
     getUserEmail,
     emailPlacehoders
};