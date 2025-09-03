const { enable } = require('../app');
const pool = require('../db/dbConfig');
const queries =  require('../services/labQueries');

const getNotificationsOfUser = async(req,res)=>{
    try {
         const {userId} = req.params;
    if(!userId){
        return res.status(404).send({
            success:false,
            message:'Please Provide the User id'
        })
    }
    const getNotifications = await pool.query(queries.GET_NOTIFICATIONS_USER,[userId]);
    if(!getNotifications.rows.length){
        return res.status(200).send({
            success:true,
            message:"No Notifications for this user",
            data:[]
        })
    }
    return res.status(200).send({
        success:true,
        message:"Successfully accessed notifications",
        data:getNotifications.rows
    })
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            success:false,
            message:"Internal server error",
            error:error.message
        })
    }
   
}

 const markAsRead = async (req, res) => {
  const { notificationId } = req.params;
  try {
    const result = await pool.query(
      queries.UPDATE_STATUS_AS_READ,
      [notificationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    return res.status(200).send({
      success: true,
      message: "Notification marked as read",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).send({
      success: false,
      message: "Internal server error",
      error:error.message
    });
  }
};
//  Mark all notifications as read (for logged-in user)
 const markAllAsRead = async (req, res) => {
  try {
    const userId = req.params.userId; 

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const result = await pool.query(
      queries.UPDATE_STATUS_ALL_READ,
      [userId]
    );

    return res.status(200).send({
      success: true,
      message: "All notifications marked as read",
      count: result.rowCount
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).send({
      success: false,
      message: "Internal server error",
      error:error.message
    });
  }
};

//delete notifications
const deleteNotifications = async(req,res)=>{
    try {
        await pool.query('BEGIN');
        const id = req.params.notificationId;
        if(!id){
            return res.status(404).send({
                success:false,
                message:'Please Provide the notification id',
            })
        }
        const deleteNotification = await pool.query(queries.DELETE_NOTIFICATION,[id]);
        if(deleteNotification.rows.length === 0){
            return res.status(400).send({
                success:false,
                message:"Could not delete the notification"
            })
        }

         await pool.query('COMMIT')
        return res.status(200).send({
            success:true,
            message:"Successfully deleted the notification",
            data:deleteNotification.rows[0]
        })
       
    } catch (error) {
        await pool.query('ROLLBACK')
        console.log(error);
        return res.status(500).send({
            success:false,
            message:"Internal Server Error",
            error:error.message
        })
    }
}

//user notification settings
const setUserNotificationSettings = async (req,res) => {
   try {
      const {preferences} = req.body;
      const userId = req.params.userId;
        if(!userId){
            return res.status(404).send({
                success: false,
                message: "User ID is required"
            });
        }
    
    const {digestFrequency,emailNotifications,inAppNotifications,quietHours} = preferences;
    if(!digestFrequency || !emailNotifications || !inAppNotifications ){
        return res.status(404).send({
            success: false,
            message: "Please provide all the required fields"
        });
    }
    let enabledTypes = [];
    let enabledInAppTypes = [];
   if (emailNotifications && typeof emailNotifications === 'object') {
      enabledTypes = Object.keys(emailNotifications).filter(key => emailNotifications[key]);
    }

    if (inAppNotifications && typeof inAppNotifications === 'object') {
      enabledInAppTypes = Object.keys(inAppNotifications).filter(key => inAppNotifications[key]);
    }
    const insertData = await pool.query(queries.INSERT_NOTIFICATION_PREFERENCES,[userId,enabledTypes,enabledInAppTypes,digestFrequency,quietHours?.enabled || false,quietHours?.startTime || null,quietHours?.endTime || null,preferences.timezone || 'Asia/Kolkata',preferences?.dailySendHour || 8,preferences?.weeklySendDay || 1]);
    if(insertData.rowCount === 0){
        return res.status(404).send({
            success: false,
            message: "Failed to set notification preferences"
        });
    }
    return res.status(200).send({
        success: true,
        message: "Notification preferences set successfully",
        data: insertData.rows[0]
    });
}
    catch (error) {
       console.log(error);
       return res.status(500).send({ 
        success: false,
        message: "Internal server error",
        error: error.message
       });
   }
}

//get user notification settings
const getUserNotificationSettings = async(req,res) => {
    try {
        const userId = req.params.userId;
        if(!userId){
            return res.status(400).send({
                success: false,
                message: "User ID is required"
            });
        }
        const getSettings = await pool.query(queries.GET_NOTIFICATION_PREFERENCES,[userId]);
        if(getSettings.rows.length === 0){
            return res.status(404).send({
                success: false,
                message: "No notification settings found"
            });
        }
        return res.status(200).send({
            success: true,
            message: "User notification settings fetched successfully",
            data: getSettings.rows[0]
        });
    } catch (error) {
        console.log("Error fetching user notification settings:", error);
        return res.status(500).send({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
}

module.exports = {
    getNotificationsOfUser,
    markAsRead,
    markAllAsRead,
    deleteNotifications,
    setUserNotificationSettings,
    getUserNotificationSettings
}