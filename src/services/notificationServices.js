const cron = require('node-cron');
const pool = require('../db/dbConfig');
const labQueries = require('./labQueries');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { sendNotification } = require('../socket');  // must be implemented
const handlebars = require('handlebars');
const {
    nowInTz,
    isWithinQuietHours,
    markEmailAsSent,
    fetchAllUsersSettings,
    fetchPendingNotificationsForUser,
    getUserEmail,
    emailPlacehoders
} = require('./emailNotificationService');

require("dotenv").config();

const sendNotificationToMail = async (template, placeholders) => {
 
  // Load HTML template
  const htmlTemplate = fs.readFileSync(template, 'utf8');

  // Compile with Handlebars
  const compiledTemplate = handlebars.compile(htmlTemplate);

  // Render with placeholders
  const populatedTemplate = compiledTemplate(placeholders);

  // Configure mail transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: placeholders.email,
    subject: placeholders.subject || placeholders.title,
    html: populatedTemplate
  };

  await transporter.sendMail(mailOptions);
};

//immediate software expiry notification
const softwareAboutToExpire = async () => {
  try {
    const getExpiryOfSoftware = await pool.query(labQueries.GET_STATUS_OF_SOFTWARE_EXPIRY);
    if (getExpiryOfSoftware.rows.length === 0) return;

    for (const lab of getExpiryOfSoftware.rows) {
      try {
        // 1 Always insert notification first (standalone, so it can't be rolled back accidentally)
        const insertNotification = await pool.query(
          labQueries.INSERT_NOTIFICATION,
          [
            "software_expiry",
            "Software Expires",
            `Software for the ${lab.cataloguename} is about to expire`,
            "medium",
            lab.user_id,
            [`{"labId":"${lab?.lab_id}"}`],
          ]
        );

        if (insertNotification.rowCount === 0) {
          console.error("Failed to insert notification for lab:", lab.lab_id);
          continue;
        }
        const notificationId = insertNotification.rows[0].id;
        // 2 Begin transaction for optional extras (email + in-app + lab_notifications)
        await pool.query("BEGIN");

        const userSettings = await pool.query(
          labQueries.GET_USER_NOTIFICATION_SETTINGS,
          [lab.user_id]
        );
        if (userSettings.rowCount === 0) {
          await pool.query("ROLLBACK");
          continue;
        }
        const settings = userSettings.rows[0];

        // ---- EMAIL NOTIFICATIONS ----
        if (settings.emailnotifications.includes("software_expiry")) {
          if (settings.email_digest !== "never" && settings.email_digest === "immediate") {
            const localTime = nowInTz(settings?.timezone || "UTC");
            const inQuiet = settings?.quiet_hours_enabled
              ? isWithinQuietHours(localTime, settings.quiet_start, settings.quiet_end)
              : false;

            if (!inQuiet) {
              const htmlTemplate = path.join(
                process.env.EMAIL_TEMPLATE_PATH
              );
              const placeholders = await emailPlacehoders(insertNotification.rows[0], lab.lab_id, await getUserEmail(lab.user_id));
              await sendNotificationToMail(htmlTemplate,placeholders);
              //  Mark email sent AFTER notification is already in DB
              await markEmailAsSent(notificationId);
            }
          }
        }

        // ---- IN-APP NOTIFICATIONS ----
        if (settings.inappnotifications.includes("software_expiry")) {
          await sendNotification({
            userId: lab.user_id,
            notification: insertNotification.rows[0],
          });

          await pool.query(labQueries.INSERT_LAB_NOTIFICATION, [
            lab?.lab_id,
            "expiry",
            lab?.enddate,
            notificationId,
          ]);
        }

        await pool.query("COMMIT");
      } catch (err) {
        console.error("Error processing lab:", lab.lab_id, err);
        await pool.query("ROLLBACK");
      }
    }
  } catch (error) {
    console.error("softwareAboutToExpire failed:", error);
  }
};

const softwareAboutToExpireOfSingleVMDatacenterLab = async () => {
  try {
    await pool.query("BEGIN");

    const getExpiryOfSoftware = await pool.query(labQueries.GET_STATUS_OF_SOFTWARE_EXPIRY_SINGLEVM_DATACENTER);
    if (getExpiryOfSoftware.rows.length === 0) {
      await pool.query("COMMIT");
      return;
    }

    for (const lab of getExpiryOfSoftware.rows) {
      const userSettings = await pool.query(labQueries.GET_USER_NOTIFICATION_SETTINGS, [lab.user_id]);
      if (userSettings.rowCount === 0) continue;

      const settings = userSettings.rows[0];
      if(settings.emailnotifications.includes('software_expiry')){
        const htmlTemplate = path.join('C:\\Users\\Admin\\Desktop\\golab_project\\Client\\public\\templates\\notification-email-template.html')
     await sendNotificationToMail(htmlTemplate,{
            title: 'Software Expiry Notification',
            priority: 'medium',
            icon: 'https://example.com/icon.png',
            message: `Software for the ${lab.cataloguename} is about to expire`,
            metadata: {
              labId: lab?.lab_id || lab?.labid
            },
            actionUrl: 'https://example.com/renew',
            actionText: 'Renew Now',
            formattedDate: new Date().toLocaleString(),
            notificationType: 'software_expiry',
            unsubscribeUrl: 'https://example.com/unsubscribe',
            preferencesUrl: 'https://example.com/preferences',
            email:process.env.EMAIL_USER,
     })}
      if (!settings.inappnotifications.includes('software_expiry')) continue;

      const insertNotification = await pool.query(
        labQueries.INSERT_NOTIFICATION,
        [
          'software_expiry',
          'Software Expires',
          `Software for the ${lab.cataloguename} is about to expire`,
          'medium',
          lab.user_id,
          [`{"labId":"${lab?.lab_id}"}`]
        ]
      );

      if (insertNotification.rowCount === 0) {
        throw new Error("Failed to insert notification");
      }

      await pool.query(labQueries.INSERT_LAB_NOTIFICATION, [
        lab?.lab_id, 'expiry', lab?.enddate, insertNotification.rows[0].id
      ]);

    }

    await pool.query("COMMIT");

    // 🔑 Publish after commit
    for (const lab of getExpiryOfSoftware.rows) {
      await sendNotification({
        userId: lab.user_id,
        notification: lab
      });
    }

  } catch (error) {
    console.error(error);
    await pool.query('ROLLBACK');
  }
};



const executeNotificationCron = async () => {
   
  cron.schedule('*/1 * * * *', async () => {
    await softwareAboutToExpire();
  });
  cron.schedule('*/1 * * * *', async () => {
    await softwareAboutToExpireOfSingleVMDatacenterLab();
  });

  /**
 * IMMEDIATE (delayed by quiet hours):
 * Every 5 minutes, attempt to send any notifications with email_sent=false
 * for users with digest=immediate and not currently in quiet hours.
 */
cron.schedule('*/5 * * * *', async () => {
  const settingsList = await fetchAllUsersSettings();
  for (const s of settingsList) {
    if (s.email_digest !== 'immediate') continue;

    const tz = s.timezone || 'Asia/Kolkata';
    const localNow = nowInTz(tz);
    const inQuiet = s.quiet_hours_enabled ? isWithinQuietHours(localNow, s.quiet_start, s.quiet_end) : false;
    if (inQuiet) continue;

    const email = await getUserEmail(s.user_id);
    if (!email) continue;

    // Fetch all pending (not emailed) notifications for this user
    const pending = await fetchPendingNotificationsForUser(s.user_id, null);
    if (pending.length === 0) continue;

    // Batch and send them as one "immediate" catch-up email (or you can send individually)
    for(const p of pending) {
        const labId = JSON.parse(p.metadata).labId || JSON.parse(p.metadata).lab_id || null;
    await sendNotificationToMail(process.env.EMAIL_TEMPLATE_PATH, await emailPlacehoders(p,labId,email)
    );
    await markEmailAsSent(p.id);
    }
  }
});

/**
 * HOURLY DIGEST:
 * At minute 0 every hour, send all pending notifications for users who chose hourly,
 * unless within quiet hours (then skip until next hour outside quiet).
 */
cron.schedule('0 * * * *', async () => {
  const settingsList = await fetchAllUsersSettings();
  for (const s of settingsList) {
    if (s.email_digest !== 'hourly') continue;

    const tz = s.timezone || 'Asia/Kolkata';
    const localNow = nowInTz(tz);
    if (s.quiet_hours_enabled && isWithinQuietHours(localNow, s.quiet_start, s.quiet_end)) continue;

    const email = await getUserEmail(s.user_id);
    if (!email) continue;

    // Pull all not-yet-emailed notifications
    const pending = await fetchPendingNotificationsForUser(s.user_id, null);
    if (pending.length === 0) continue;

    // Batch and send them as one "immediate" catch-up email (or you can send individually)
    for(const p of pending) {
        const labId =  JSON.parse(p.metadata).labId || null;
    await sendNotificationToMail(process.env.EMAIL_TEMPLATE_PATH, await emailPlacehoders(p,labId,email)
    );
    await markEmailAsSent(p.id);
    }
  }
});

/**
 * DAILY DIGEST:
 * Every 10 minutes, check users who chose daily and if the local time matches their daily_send_hour
 * and not in quiet hours, then send pending notifications.
 */
cron.schedule('*/10 * * * *', async () => {
  const settingsList = await fetchAllUsersSettings();
  for (const s of settingsList) {
    if (s.email_digest !== 'daily') continue;

    const tz = s.timezone || 'Asia/Kolkata';
    const localNow = nowInTz(tz);
    const hour = localNow.getHours();

    if (s.quiet_hours_enabled && isWithinQuietHours(localNow, s.quiet_start, s.quiet_end)) continue;
    if (hour !== Number(s.daily_send_hour || 8)) continue; // only send around the configured hour

    const email = await getUserEmail(s.user_id);
    if (!email) continue;

    const pending = await fetchPendingNotificationsForUser(s.user_id, null);
    if (pending.length === 0) continue;

    // Batch and send them as one "immediate" catch-up email (or you can send individually)
    for(const p of pending) {
        const labId = JSON.parse(p.metadata).labId || null;
    await sendNotificationToMail(process.env.EMAIL_TEMPLATE_PATH, await emailPlacehoders(p,labId,email));
    await markEmailAsSent(p.id);
    }
  }
});

/**
 * WEEKLY DIGEST:
 * Every 30 minutes, check users who chose weekly, and if it's their chosen weekday
 * and local hour equals daily_send_hour and not in quiet hours, send pending.
 */
cron.schedule('*/30 * * * *', async () => {
  const settingsList = await fetchAllUsersSettings();
  for (const s of settingsList) {
    if (s.email_digest !== 'weekly') continue;

    const tz = s.timezone || 'Asia/Kolkata';
    const localNow = nowInTz(tz);
    const hour = localNow.getHours();
    const isoDay = localNow.getDay() === 0 ? 7 : localNow.getDay(); // 1=Mon ... 7=Sun

    if (s.quiet_hours_enabled && isWithinQuietHours(localNow, s.quiet_start, s.quiet_end)) continue;
    if (isoDay !== Number(s.weekly_send_day || 1)) continue;
    if (hour !== Number(s.daily_send_hour || 8)) continue;

    const email = await getUserEmail(s.user_id);
    if (!email) continue;

    const pending = await fetchPendingNotificationsForUser(s.user_id, null);
    if (pending.length === 0) continue;

    // Batch and send them as one "immediate" catch-up email (or you can send individually)
    for(const p of pending) {
        const labId = JSON.parse(p.metadata).labId || null;
    await sendNotificationToMail(process.env.EMAIL_TEMPLATE_PATH, await emailPlacehoders(p,labId,email)
    );
    await markEmailAsSent(p.id);
    }
  }
});

};

module.exports = { executeNotificationCron ,sendNotificationToMail};
