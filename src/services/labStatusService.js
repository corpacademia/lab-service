const cron = require('node-cron');
const pool =  require('../db/dbConfig');
const labQueries = require('./labQueries');

const expireLabsAndLog =async  ({
  fetchQuery,
  updateQuery,
  logQuery,
  labType,
  ownerType, 
}) =>{
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(fetchQuery);
    if (res.rows.length === 0) {
      console.log(`[${labType}] No labs to expire.`);
      await client.query('COMMIT');
      return;
    }

    await client.query(updateQuery);

    for (const lab of res.rows) {
      await client.query(
        logQuery,
        [lab.lab_id, labType, ownerType, lab.status, 'expired', 'cron_job']
      );
    }

    await client.query('COMMIT');
    console.log(`[${labType}] Expired ${res.rows.length} labs and logged.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[${labType}] Cron failed:`, err);
  } finally {
    client.release();
  }
}

//update cloudslicelab user completion status
const updateUserCloudsliceModularLabStatus = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: allLabs } = await client.query(labQueries.GET_CLOUDSLICE_MODULAR_LAB);
    if (!allLabs.length) {
      await client.query("COMMIT");
      return;
    }

    for (const lab of allLabs) {
      const { rows: modules } = await client.query(labQueries.GET_MODULES, [lab.labid]);

      for (const mod of modules) {
        const { rows: exercises } = await client.query(labQueries.GET_EXERCISES_MODULE, [mod.id]);
        const { rows: users } = await client.query(labQueries.GET_LABEXERCISE_DATA, [mod.id]);

        for (const user of users) {
          let allCompleted = true;

          for (const exercise of exercises) {
            if (exercise.type === "lab") {
              const { rows: labStatusRows } = await client.query(
                labQueries.GET_IS_LAB_COMPLETED,
                [user.user_id, mod.id]
              );
              if (!labStatusRows.length || !labStatusRows[0].has_all_completed_status) {
                allCompleted = false;
                break;
              }
            } else if (exercise.type === "quiz") {
              const { rows: quizStatusRows } = await client.query(
                labQueries.GET_IS_QUIZ_COMPLETED,
                [user.user_id, mod.id]
              );
              if (!quizStatusRows.length || !quizStatusRows[0].has_all_completed_status) {
                allCompleted = false;
                break;
              }
            }
          }

          await client.query(labQueries.INSERT_MODULE_STATUS_USER_LAB, [
            user.user_id,
            mod.lab_id,
            mod.id,
            allCompleted ? "completed" : "in-progress",
          ]);
        }
      }
    }

    await client.query("COMMIT");
    console.log("Cloudslice modular lab user status update complete.");
  } catch (error) {
    console.error("Error in updateUserCloudsliceModularLabStatus:", error);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
};

//update cloudslice user lab status
const updateUserCloudSliceLabStatus = async (
  {fetchQuery,
  updateQuery}
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: allModularLabs } = await client.query(labQueries.GET_CLOUDSLICE_MODULAR_LAB);

    if (allModularLabs.length === 0) {
      console.log(`cloudslice: No labs found`);
      await client.query('COMMIT');
      return;
    }

    for (const lab of allModularLabs) {
      const { rows: userLabs } = await client.query(
        fetchQuery,
        [lab.labid]
      );

      if (userLabs.length === 0) {
        console.log(`cloudslice: No user labs found for lab ${lab.labid}`);
        continue;
      }
       
      for (const userLab of userLabs) {
       

        const { rows: statusRows } = await client.query(
          labQueries.GET_LAB_MODULAR_STATUS_USER,
          [userLab.labid, userLab.user_id]
        );

        const isCompleted = statusRows[0]?.has_all_completed_status;

        const newStatus = isCompleted ? 'completed' : 'in-progress';

        await client.query(
          updateQuery,
          [newStatus, userLab.user_id, userLab.labid]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Cloudslice modular lab status update complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating cloudslice modular lab status:', error);
  } finally {
    client.release();
  }
};

//send software expiry notification
const sendSoftwareExpiryNotification = async()=>{

}

//execute
const executeCron = () =>{
//single vm aws
cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_OF_SINGLEVM_LAB,
    updateQuery: labQueries.UPDATE_SINGLEvM_AWS_LAB_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'singlevm-aws-lab',
    ownerType: 'lab'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_OF_SINGLEVM_ORGLAB,
    updateQuery: labQueries.UPDATE_SINGLEvM_AWS_ORG_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'singlevm-aws-org',
    ownerType: 'org'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_OF_SINGLEVM_USERLAB,
    updateQuery: labQueries.UPDATE_SINGLEvM_AWS_USER_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'singlevm-aws-user',
    ownerType: 'user'
  });
});

//single vm datacenter
cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_SINGLEVM_DATACENTER_LAB,
    updateQuery: labQueries.UPDATE_SINGLEVM_DATACENTER_LAB_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'singlevm-datacenter-lab',
    ownerType: 'lab'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_SINGLEVM_DATACENTER_ORG,
    updateQuery: labQueries.UPDATE_SINGLEVM_DATACENTER_ORG_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'singlevm-datacenter-org',
    ownerType: 'org'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_SINGLEVM_DATACENTER_USER,
    updateQuery: labQueries.UPDATE_SINGLEVM_DATACENTER_USER_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'singlevm-datacenter-user',
    ownerType: 'user'
  });
});

//VMCLUSTER DATACENTER

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_VMCLUSTER_DATACENTER_LAB,
    updateQuery: labQueries.UPDATE_VMCLUSTER_DATACENTER_LAB_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'vmcluster-datacenter-lab',
    ownerType: 'lab'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_VMCLUSTER_DATACENTER_ORG,
    updateQuery: labQueries.UPDATE_VMCLUSTER_DATACENTER_ORG_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'vmcluster-datacenter-org',
    ownerType: 'org'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_VMCLUSTER_DATACENTER_USER,
    updateQuery: labQueries.UPDATE_VMCLUSTER_DATACENTER_USER_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'vmcluster-datacenter-user',
    ownerType: 'user'
  });
});

//cloudslice status
// cron.schedule('*/1 * * * *', async () => {
//   await expireLabsAndLog({
//     fetchQuery: labQueries.GET_STATUS_CLOUDSLICE_LAB,
//     updateQuery: labQueries.UPDATE_cloudslice_LAB_STATUS,
//     logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
//     labType: 'cloudslice-lab',
//     ownerType: 'lab'
//   });
// });

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_CLOUDSLICE_ORG,
    updateQuery: labQueries.UPDATE_cloudslice_ORG_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'cloudslice-org',
    ownerType: 'org'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_CLOUDSLICE_USER,
    updateQuery: labQueries.UPDATE_cloudslice_USER_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'cloudslice-user',
    ownerType: 'user'
  });
});

cron.schedule('*/1 * * * *', async () => {
  await expireLabsAndLog({
    fetchQuery: labQueries.GET_STATUS_CLOUDSLICE_USER_PURCHASED,
    updateQuery: labQueries.UPDATE_cloudslice_USER_PURCHASED_STATUS,
    logQuery: labQueries.INSERT_LAB_STATUS_LOGS,
    labType: 'cloudslice-user-purchased',
    ownerType: 'user-purchased'
  });
});

//cloudslice modular lab status of user
// Schedule the job to run every 1 minute
cron.schedule('*/1 * * * *', async () => {
  console.log('Running updateUserCloudsliceModularLabStatus() via cron');
  try {
    await updateUserCloudsliceModularLabStatus();
    console.log('Lab status update completed successfully.');
  } catch (error) {
    console.error('Error running updateUserCloudsliceModularLabStatus in cron:', error);
  }
});

//update cloudlice modular status of user
cron.schedule('*/1 * * * *', async () => {
  await updateUserCloudSliceLabStatus({
    fetchQuery: labQueries.GET_ALL_USER_CLOUDSLICE_LABS,
    updateQuery: labQueries.UPDATE_CLOUDSLICE_USER_MODULAR,
  });
});

//update cloudlice modular status of user purchased
cron.schedule('*/1 * * * *', async () => {
  await updateUserCloudSliceLabStatus({
    fetchQuery: labQueries.GET_ALL_USER_CLOUDSLICE_PURCHASED_LABS,
    updateQuery: labQueries.UPDATE_CLOUDSLICE_USER_PURCHASED_MODULAR,
  });
});
}

module.exports = {executeCron};