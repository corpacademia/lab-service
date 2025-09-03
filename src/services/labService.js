const path = require('path');
const { labBatch } = require('../controllers/labController');
const pool = require('../db/dbConfig');
const labQueries = require('./labQueries');
const queries = require('./labQueries');
const { spawn } = require('child_process');
const axios = require('axios');
const { randomBytes } = require('crypto');
const { getUserEmail, markEmailAsSent, isWithinQuietHours, nowInTz, emailPlacehoders } = require('./emailNotificationService');
const { sendNotificationToMail } = require('./notificationServices');
const { sendNotification } = require('../socket');

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

//execute the python scripts
const executeVMScript = async (scriptName, ...args) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", [path.resolve(__dirname, scriptName), ...args]);

    let result = "";
    let errorResult = "";

    pythonProcess.stdout.on("data", (data) => {
      console.log(data.toString());
      result += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error(data.toString());
      errorResult += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code === 0) {
        resolve(result.trim());
      } else {
        reject(errorResult.trim());
      }
    });
  });
};

const connectToVm = async (...args) => {
  try {
    if (args.length < 4) {
      throw new Error("Please provide required fields.");
    }

    const scriptPath = path.resolve(__dirname, "../terraformScripts/VMConnect.py");

    const result = await executeVMScript(scriptPath, ...args);
    return {
      success: true,
      message: "Terraform script executed successfully",
      result
    };

  } catch (error) {
    throw new Error(`Error executing Terraform script: ${error.message}`);
  }
};

//lab tables that contains the details of the lab
const createLab=async(data,user)=>{
    try{
       const {type,details,platform,provider,config,instance,userGuides,
      labGuides} = data;
       const output = await pool.query(queries.CREATE_LAB,[user.id,type,platform,provider,
        config.os,config.os_version,config.cpu,
        config.ram,config.storage,instance,details.title,
        details.description,details.duration,config.snapshotType,
        labGuides,userGuides,details.guacamole.name,details.guacamole.url]);
       
       return output.rows[0];
    }
    catch(error){
        console.log('Error in createlab service:',error.message);
        throw error
     }
}

//create lab for single vm datacenter
const createSingleVmDatacenterLab = async (data, user) => {
    try {
        const { details, type, platform, labGuides, userGuides  } = data;
        const { title, description,guacamole } = details;
        const { startDate, startTime, endDate, endTime,protocol,users } = data.datacenterConfig;
        const output = await pool.query(queries.INSERT_DATACENTER_LAB, [
            user,
            title,
            description,
            type,
            platform,
            `${startDate} ${startTime}`,
            `${endDate} ${endTime}`,
            labGuides,
            userGuides,
            protocol,
            guacamole.name,
            guacamole.url
        ]);
        if (!output.rows[0]) {
            throw new Error("Could not create the lab");    
        }
        for(const user of users){
        const datacenter_creds= await pool.query(queries.INSERT_DATACENTER_VM_CREDS, [output.rows[0].lab_id,user.username, user.password, user.ip, user.port, protocol]);
        if (!datacenter_creds.rows[0]) {
            throw new Error("Could not store the datacenter credentials");
        }
    }
        return output.rows[0];
    } catch (error) {
        console.log('Error in createSingleVmLab service:', error.message);
        throw new Error(error.message);
    }
};  
//get datacenter lab credentials
const getDatacenterLabCredentials = async (labId) => {
    try {
        const result = await pool.query(queries.GET_DATACENTER_LAB_CREDS, [labId]);
        if (!result.rows.length) {
            throw new Error("No credentials found for this lab");
        }
        return result.rows;
    } catch (error) {
        console.error("Error in getDatacenterLabCredentials service:", error.message);
        throw new Error("Error retrieving datacenter lab credentials: " + error.message);
    }
};
//update single vm datacenter lab
const updateSingleVmDatacenterLab = async (labId, software, catalogueType,catalogueName,level,category,price) => {
    try {
        const result = await pool.query(queries.UPDATE_SINGLEVM_DATACENTER, [software, catalogueType, labId,catalogueName,level,category,price]);
        if (!result.rows[0]) {
            throw new Error("Could not update the single VM datacenter lab");
        }
        return result.rows[0];
    } catch (error) {
        console.error("Error in createSingleVmDatacenterLab service:", error.message);
        throw new Error(error.message);
    }
}
//get all lab catalogues
const getAllLabCatalogues = async () => {
    try {
        const result = await pool.query(queries.GET_ALL_CATALOGUES);
        if (!result.rows.length) {
            throw new Error("No catalogues found");
        }
        return result.rows;
    } catch (error) {
        console.error("Error in getAllLabCatalogues service:", error.message);
        throw error;
    }
};

//get user purchased labs
const getUserPurchasedSinglvmLabs = async(userId)=>{
    try {
        const result = await pool.query(queries.GET_USER_PURCHASED_SINGLEVM_AWS,[userId]);
        if(!result.rows.length){
            return [];
        }
        return result.rows;
    } catch (error) {
        console.log('Error in getting the single vm purchased labs');
        throw error;
    }
}

//delete catalogue
const deleteCatalogue = async (catalogueId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(queries.UPDATE_CREATELAB_CATALOGUE, [catalogueId]);
    await client.query(queries.UPDATE_SINGLEVM_CATALOGUE, [catalogueId]);
    await client.query(queries.UPDATE_VMCLUSTER_CATALOGUE, [catalogueId]);
    await client.query(queries.UPDATE_CLOUDSLICE_CATALOGUE, [catalogueId]);

    await client.query('COMMIT');

    return { success: true, message: 'Catalogue updated to private' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in deleteCatalogue service:', error.message);
    throw new Error('Failed to delete catalogue');
  } finally {
    client.release();
  }
};

//update catalogue update details

const updateCatalogueDetails = async (
  labId,
  category,
  description,
  price,
  level,
  provider,
  cataloguename
) => {
  const values = [labId, category, description, price, level, cataloguename];

  const updateQueries = [
    queries.UPDATE_CREATELAB_CATALOGUE_DETAILS,
    queries.UPDATE_SINGLEVM_CATALOGUE_DETAILS,
    queries.UPDATE_VMCLUSTER_CATALOGUE_DETAILS,
    queries.UPDATE_CLOUDSLICE_CATALOGUE_DETAILS,
  ];

  try {
    for (const query of updateQueries) {
      const result = await pool.query(query, values);

      // Check if any row was updated
      if (result.rowCount > 0) {
        console.log(`Updated successfully `);
        return result.rows[0]; // Stop after first successful update
      }
    }

    // If no update happened in any table
    throw new Error('Catalogue update failed. Lab ID not found in any table.');
  } catch (error) {
    console.error('Error updating catalogue details:', error.message);
    throw new Error(error.message);
  }
};



//update single vm user cred running state
const  updateSingleVMDatacenterUserCredRunningState = async (isrunning, User, labId) => {
    try {
        console.log("Updating user credential running state:", { isrunning, User, labId });
        if(isrunning){
            const update = await pool.query(queries.UPDATE_SINGLEVM_DATACENTER_USER_STATUS,['started', User, labId]);
            if(!update.rows.length){
                throw new Error("No lab instance found for this user");
            }
        }
        const result = await pool.query(queries.UPDATE_SINGLEVM_DATACENTER_CREDS_RUNNINGSTATE, [isrunning, User, labId]);
        if (!result.rows[0]) {
            throw new Error("Could not update the single VM datacenter lab");
        }
        return result.rows[0];
    } catch (error) {
        console.error("Error in updating the running state of user:", error.message);
        throw new Error(error.message);
    }
}
//UPDATE SINGLE VM DATACENTER LAB 
const updateSingleVMDatacenterLab = async(title,description,startDate,endDate,labGuide,userGuide,labId,software,credentials)=>{
        try {
            if(!title || !description ||!startDate ||!endDate||!labGuide||!userGuide||!labId || !credentials){
                throw new Error("Please Provide All The Required Fields")
            }
            const result = await pool.query(labQueries.UPDATE_SINGLEVM_DATACENTER_CONTENT,[title,description,startDate,endDate,labGuide,userGuide,software,labId]);
            if(!result.rows.length){
                throw new Error("No lab is found with this id to Edit")
            }
           const validCredentialsId = new Set();

for (const cred of credentials) {
  const existing = await pool.query(labQueries.GET_DATACENTER_LAB_CREDS_ONID, [cred.id]);

  if (existing.rows.length) {
    validCredentialsId.add(cred.id);
    await pool.query(
      labQueries.EDIT_SINGLEVM_DATACENTER_CREDS,
      [cred.username, cred.password, cred.ip, cred.port, cred.protocol, cred.id, labId]
    );
  } else {
    const inserted = await pool.query(
      labQueries.INSERT_DATACENTER_VM_CREDS,
      [labId, cred.username, cred.password, cred.ip, cred.port, cred.protocol]
    );
    validCredentialsId.add(inserted.rows[0].id);
  }
}

// Remove stale credentials not in the current form
const existingCreds = await pool.query(labQueries.GET_DATACENTER_LAB_CREDS,[labId]);

for (const cred of existingCreds.rows) {
  if (!validCredentialsId.has(cred.id)) {
    await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_CREDS_ONID, [cred.id]);
  }
}

            return result.rows[0];
        } catch (error) {
            console.log("Error in editing the lab");
            throw new Error(error.message);
        }
}

//update single vm aws lab
const updateSingleVMAwsLab = async(title,description,cpu,ram,os,provider,instance,software,labGuide,userGuide,endDate,labId)=>{
    try {
        if(!title || !description ||!cpu ||!ram||!os||!provider||!instance||!software||!labGuide||!userGuide||!endDate||!labId){
            throw new Error("Please Provide All The Required Fields")
        }
        const result = await pool.query(labQueries.UPDATE_SINGLEVM_AWS_CONTENT,[title,description,cpu,ram,os,provider,instance,software,labGuide,userGuide,endDate,labId]);
        if(!result.rows.length){
            throw new Error("No lab is found with this id to Edit")
        }
        return result.rows[0];
    } catch (error) {
        console.log("Error in editing the lab");
        throw new Error(error.message);
    }
}

//assign datacenter lab to organization
const createDatacenterLabOrgAssignment = async (labId, orgId,admin_id, assignedBy,startDate,endDate) => {
    try {
        const checkAlreadyAssigned = await pool.query(queries.GET_SINGLEVM_DATACENTER_ORG_LAB,[labId,orgId,admin_id]);
        if(checkAlreadyAssigned.rows.length){
            throw new Error("Lab Already Assigned")
        }
        const checkCredentialsAvailable = await pool.query(queries.GET_DATACENTER_LAB_CREDS_ONLABID,[labId]);{
            if(!checkCredentialsAvailable.rows.length){
                throw new Error("No credentials available for this lab");
            }
        }
        const result = await pool.query(queries.INSERT_DATACENTER_VM_ORGASSIGNMENT, [labId, orgId,admin_id, assignedBy,startDate,endDate]);
        if (!result.rows[0]) {
            throw new Error("Could not assign the datacenter lab to the organization");
        }
        return result.rows[0];
    } catch (error) {
        console.error("Error in createDatacenterLabOrgAssignment service:", error.message);
        throw error;
    }
}

//delete single vm datacenter lab for user 
const deleteSingleVMDatacenterLabForUser = async(labId,userId)=>{
    try {
        await pool.query(labQueries.DELETE_USER_CRED_FROM_CREDS,[null,userId]);
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_FROM_USER,[labId,userId]);
        return true
    } catch (error) {
        console.log("Error in deleting the single vm datacenter lab of user:",error.message);
        throw new Error(error.message);
    }
}
//delete the sigle vm datacenter lab from organization
const deleteSingleVMDatacenterLabFromOrg = async(labId,orgId)=>{
     try {
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_CREDS_FROM_ORG,[null,null,orgId]);
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_ORGASSINGMENT_FROM_ORG,[labId,orgId]);
        return true
    } catch (error) {
        console.log("Error in deleting the single vm datacenter lab of user:",error.message);
        throw new Error(error.message);
    }
}

//assign single vm datacenter credentials to users
const assignSingleVmDatacenterCredsToOrg = async(labId,orgId,assignedBy,admin_id)=>{
    try {
        const result = await pool.query(queries.UPDATE_SINGLEVM_DATACENTER_CREDS, [orgId,assignedBy, labId,admin_id]);
        if (!result.rows[0]) {
            throw new Error("Could not assign the datacenter lab credentials to the organization");
        }
        return result.rows[0];
    } catch (error) {
        console.log("Error in assignSingleVmDatacenterCredsToOrg service:", error.message);
        throw new Error(error.message);
    }
}

//edit single vm datacenter credentials
const editSingleVmDatacenterCreds = async ( username, password, ip, port, protocol,id, labId,) => {
    try {
        const result = await pool.query(queries.EDIT_SINGLEVM_DATACENTER_CREDS, [username, password, ip, port, protocol, id, labId]);
        if (!result.rows[0]) {
            throw new Error("Could not update the datacenter lab credentials");
        }
        return result.rows[0];
    } catch (error) {
        console.error("Error in editSingleVmDatacenterCreds service:", error.message);
        throw new Error(error.message);
    }
}
//get the orgassignedsinglevmdatacenter lab
const getOrgAssignedsingleVMDatacenterLab = async(orgid,created_by)=>{
    try {
        const result = await pool.query(labQueries.GET_SINGLEVM_DATACENTER_ORG,[orgid,created_by]);
        if(!result.rows.length){
            return [];
            // throw new Error("Could not fetch org assigned labs");
        }
        return result.rows;
    } catch (error) {
        console.error("Error in getting the orgassigned lab");
        throw new Error(error.message);
    }
}

//update singlevmdatacenter creds disable
const updateSingleVmDatacenterCredsDisable = async(id,disable)=>{
    try {
        const result = await pool.query(queries.UPDATE_SINGLEVM_DATACENTER_CREDS_DISABLE,[disable,id]);
        console
        if(!result.rows[0]){
            throw new Error("Could not update the disable")
        }
        return result.rows[0];
    } catch (error) {
        console.error("Error in updating disable :",error.message);
        throw new Error(error.message);
    }
}

//delete singlevmdatacenter lab
const deleteSingleVmDatacenterLab = async (labId)=>{
    try {
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_USERASSIGNMENT,[labId]);
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_ORGASSINGMENT,[labId]);
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_CREDS,[labId]);
        await pool.query(labQueries.DELETE_SINGLEVM_DATACENTER_LAB,[labId]);
        return ;
    } catch (error) {
        console.error("Error in deleting the single vm datacenter lab:",error.message);
        throw new Error(error.message)
    }
}
//INSERT THE SINGLE VM DATACENTER LAB TO USER
const assignSingleVmDatacenterLabToUser = async(data,sessionToken)=>{
    try {
        const {labId,orgId,userId,assignedBy,startDate,endDate}= data;
    if(!labId || !userId||!assignedBy||!startDate||!endDate ){
        throw new Error("Please Provide the required fields");
    }
     const userIds = Array.isArray(userId) ? userId : [userId];
      
          const insertedRows = [];
          for (const user of userIds) {
            const checkAlreadyAssigned =  await pool.query(labQueries.CHECK_USERASSIGNED_SINGLEVM_DATACENTER_LAB,[labId,user]);
            const userData = await getUserData(user,sessionToken)
            if(checkAlreadyAssigned.rows.length){
                throw new Error(`Lab already assigned to ${userData.name}`);
            }
            let result;
            if(orgId === null){
              result = await pool.query(labQueries.UPDATE_SINGLEVM_DATACENTER_CREDS_ASSIGNMENT_FOR_RANDOM_USER,[user,labId])
            }
            else{
                result = await pool.query( labQueries.UPDATE_SINGLEVM_DATACENTER_CREDS_ASSIGNMENT,[user,labId,orgId])
            }
    if(!result.rows.length){
        throw new Error('No credential available to assign')
    }
    const assign =  await pool.query(labQueries.INSERT_DATACENTER_VM_USERASSIGNMENT,[labId,user,assignedBy,startDate,endDate,result.rows[0].id]);
    if(!assign.rows.length){
        throw new Error("Could not assign lab to user");
    }
      
      
            insertedRows.push(assign.rows[0]);
          }
      
          return insertedRows;

    } catch (error) {
        console.log(error);
        // throw new Error("Error in assigning the lab to user");
        throw error;
    }
    
}

//get all the single vm datacenter labs 
const getAllSingleVMDatacenterLabs = async (id) => {
    try {
        const result = await pool.query(labQueries.GET_SINGLE_VM_DATACENTER,[id]);
        if (!result.rows.length) {
            return [];
        }
        return result.rows;
    } catch (error) {
        console.log(error);
        throw new Error("Error in retrieving the single VM datacenter labs");
    }
}

//
const getUserAssignedSingleVMDatacenterLabs =  async(userId)=>{
    try {
        const result =  await pool.query(labQueries.GET_USERASSIGNED_SINGLEVM_DATACENTER_LAB,[userId]);
        if(!result.rows.length){
            // throw new Error("No labs found for this user.");
            return [];
        }
        return result.rows;
    } catch (error) {
        console.log(error);
        throw new Error("Error in retrieving the user labs")
    }
}

//get the credentials for user
const getUserAssignedSingleVMDatacenterCredsToUser =  async(labId,userId)=>{
    try {
        const result =  await pool.query(labQueries.GET_DATACENTER_LAB_CREDS_TOUSER,[labId,userId]);
        if(!result.rows.length){
            throw new Error("No lab credentials found for this user.");
        }
        return result.rows;
    } catch (error) {
        console.log(error);
        throw new Error("Error in retrieving the user lab credentials")
    }
}
//get the labs created
const getAllLab = async()=>{
    try{
        const labs = await pool.query(labQueries.GET_ALL_LAB);
       
        return labs
        
    }
    catch(error){
        console.log("Error in getAllLab service:",error.message);
        throw error
    }
}

//get datacenter labs on admin id
const getDatacenterLabsOnAdminId = async (adminId) => {
    try {
        const result = await pool.query(labQueries.GET_DATACENTER_LAB_ON_ADMIN_ID, [adminId]);
        if (!result.rows.length) {
            throw new Error("No datacenter labs found for this admin");
        }
        return result.rows;
    } catch (error) {
        console.error("Error in getDatacenterLabsOnAdminId service:", error.message);
        throw new Error("Error retrieving datacenter labs: " + error.message);
    }
};

//get datacenter labs on lab id
const getDatacenterLabsOnLabId = async (labId) => {
    try {
        const result = await pool.query(labQueries.GET_DATACENTER_LAB_ON_LAB_ID, [labId]);
        if (!result.rows.length) {
            throw new Error("No datacenter labs found for this Lab id");
        }
        return result.rows[0];
    } catch (error) {
        console.error("Error in getDatacenterLabsOnLabId service:", error.message);
        throw new Error("Error retrieving datacenter labs: " + error.message);
    }
};

//GET LAB ON ID
const getLabOnId = async(labId)=>{
    try{
        const result = await pool.query(labQueries.GET_LAB_ON_ID,[labId]);

        return result.rows[0];
    }
    catch(error){
       console.log("Error in getlabonid service:",error)
    }
}

//ASSIGN LAB TO USERS
const assignLab = async (lab, userIds, assign_admin_id,startDate,endDate,sessionToken) => {
    try {
        // Normalize `userIds` to an array
        userIds = Array.isArray(userIds) ? userIds : [userIds];
        // Get configuration details
        // const getDays = await pool.query(labQueries.GET_CONFIG_DETAILS_RANDOM_USER, [lab]);
        // if (!getDays.rows.length) {
        //     throw new Error("Invalid lab ID");
        // }

        // let date = new Date();
        // date.setDate(date.getDate() + getDays.rows[0].config_details.numberOfDays);
        // let completion_date = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD

        // Arrays to track successful assignments and errors
        const successfulAssignments = [];
        const errors = [];

        for (const user of userIds) {
            const checkAlreadyAssigned = await pool.query(labQueries.CHECK_ALREADY_ASSIGNED, [user, lab]);
            const userData = await getUserData(user,sessionToken)
            if (checkAlreadyAssigned.rows.length > 0) {
                throw new Error(`Lab already assigned to ${userData.name}`)
            }
            // Insert lab assignment into the database
            const result = await pool.query(labQueries.ASSIGN_LAB, [
                lab,
                user,
                startDate,
                endDate,
                assign_admin_id,
            ]);
            if (result.rows.length > 0) {
                successfulAssignments.push(result.rows[0]);
                await pool.query('BEGIN');
                    const insertNotification = await pool.query(labQueries.INSERT_NOTIFICATION, ['lab_assigned', 'Lab Assigned', `A new lab has been assigned to you. Lab ID: ${lab}`,'medium', user,[JSON.stringify({
                labId: lab,
                assigned_by: assign_admin_id,
                assignment_id: result.rows[0]?.id ?? null, 
                start_date: startDate,
                end_date: endDate,
                })] ]);
                const userSettings  = await pool.query(labQueries.GET_USER_NOTIFICATION_SETTINGS, [user]);
                if(userSettings.rows.length > 0){
                 const settings = userSettings.rows[0];
                         // ---- EMAIL NOTIFICATIONS ----
                 if (settings.emailnotifications.includes("lab_assigned")) {
                          if (settings.email_digest !== "never" && settings.email_digest === "immediate") {
                            const localTime = nowInTz(settings?.timezone || "UTC");
                            const inQuiet = settings?.quiet_hours_enabled
                              ? isWithinQuietHours(localTime, settings.quiet_start, settings.quiet_end)
                              : false;
                
                            if (!inQuiet) {
                              const htmlTemplate = path.join(
                                process.env.EMAIL_TEMPLATE_PATH
                              );
                              const placeholders = await emailPlacehoders(insertNotification.rows[0], lab, await getUserEmail(user));
                              await sendNotificationToMail(htmlTemplate,placeholders);
                              //  Mark email sent AFTER notification is already in DB
                              await markEmailAsSent(insertNotification.rows[0]?.id);
                            }
                          }
                }
                                    // ---- IN-APP NOTIFICATIONS ----
                if (settings.inappnotifications.includes("lab_assigned")) {
                          await sendNotification({
                            userId: user,
                            notification: insertNotification.rows[0],
                          });
                
                          await pool.query(labQueries.INSERT_LAB_NOTIFICATION, [
                            lab,
                            "lab_assigned",
                            endDate,
                            insertNotification.rows[0]?.id,
                          ]);
                }}
                await pool.query('COMMIT');
                
            } else {
                errors.push({
                    user_id: user,
                    lab_id: lab,
                    message: "Failed to assign the lab",
                });
            }
        }

        return { successfulAssignments, errors };
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
};

//get user assigned lab on id
const getAssignLabOnId = async (userId) => {
    try {
        const result = await pool.query(queries.GET_ASSIGNED_LABS, [userId]);
      
        if (!result.rows) {
            const result = await pool.query(queries.GET_ASSIGNED_PURCHASED_LABS,[userId]);
            if(!result.rows) return [];
            
        }

        return result.rows;
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
};

//get user labs on labid and userid
const getAssignLabOnLabId = async(labId,userId) =>{
    try {
        let result;
        result = await pool.query(queries.GET_ASSIGNED_LABS_ON_LABID,[labId,userId]);

        if(!result.rows[0]){
            result = await pool.query(queries.GET_ASSIGNED_PURCHASED_LABS_ON_LABID,[labId,userId]) 
            if(!result.rows[0]){
            throw new Error("Error in retrieving the lab");
        }
        }
        return result.rows[0];

    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}

const getInstanceOnParameters = async (cloud, cpu, ram) => {
    try {
        let table;
        switch (cloud.toLowerCase()) {
            case 'aws':
                table = 'ec2_instance';
                break;
            case 'azure':
                table = 'azure_vm';
                break;
            default:
                throw new Error("Unsupported cloud platform");
        }

        const core = cpu.toString();
        const memory = ram.toString();
        const query = labQueries.GET_INSTANCES_DETAILS(table);
        const result = await pool.query(query, [core, memory]);

        if (!result.rows.length) {
            throw new Error("No data found for the given parameters");
        }

        return result.rows;
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
};

const getInstanceDetailsForPricing = async (provider, instance, cpu, ram) => {
    try {
        let table, instancename;
        switch (provider.toLowerCase()) {
            case 'aws':
                table = 'ec2_instance';
                instancename = 'instanceName';
                break;
            case 'azure':
                table = 'azure_vm';
                instancename = 'instance';
                break;
            default:
                throw new Error("Unsupported provider");
        }

        const query = queries.GET_INSTANCE_DETAILS_FOR_PRICING(table, instancename);
        const result = await pool.query(query, [instance, cpu, ram]);

        if (!result.rows.length) {
            throw new Error("No data found with the provided details");
        }

        return result.rows[0];
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
};

const updateLabConfig = async (lab_id, admin_id, config_details) => {
    const result = await pool.query(queries.UPDATE_LAB_CONFIG, [lab_id, admin_id, config_details]);
    return result.rows[0]; // Return the result to the controller
};

const updateSingleVMAws =  async(catalogueName,
  numberOfDays,
  hoursPerDay,
  expiresIn,
  software,
  catalogueType,labId,level,category,price)=>{
    try {
        const update =  await pool.query(labQueries.UPDATE_SINGLEVM_AWS,[catalogueName,catalogueType,numberOfDays,hoursPerDay,software,expiresIn, labId,level,category,price]);
        if(!update.rows.length){
            return []
        }
        return update.rows;
    } catch (error) {
        console.log(error)
        throw error;
    }
  }

//check whether the ami is created
const getAmiInformation = async (lab_id) => {
    const result = await pool.query(queries.GET_AMI_INFO, [lab_id]);
    return result.rows[0]; // Return the result to the controller
};

const getAwsInstanceDetails = async (lab_id) => {
    const result = await pool.query(queries.GET_INSTANCE_DETAILS, [lab_id]);
    return result.rows[0]; // Return the instance details to the controller
};

const getAwsInstanceDetailsOfUsers = async (lab_id, user_id) => {
    const result = await pool.query(queries.GET_USER_INSTANCE_DETAILS, [lab_id, user_id]);
    return result.rows[0]; // Return instance details
};

const updateAwsInstanceDetailsOfUsers = async (lab_id, user_id, state, isStarted) => {
    if(!isStarted){
        const result = await pool.query(queries.UPDATE_USER_INSTANCE_STATES, [true,state, lab_id, user_id]);
         const update = await pool.query(queries.UPDATE_USER_SINGLEvM_AWS_STATUS,['started', lab_id, user_id]);
        if(!update.rows.length){
            const update = await pool.query(queries.UPDATE_USER_SINGLEvM_AWS_PURCHASED_STATUS,['started', lab_id, user_id])
            if(!update.rows.length){
            throw new Error("No lab instance found for this user");
        }
        }
        return result.rows[0];
    }
    else{
       
        const result = await pool.query(queries.UPDATE_USER_INSTANCE_STATE, [state, lab_id, user_id]);
        return result.rows[0]; // Return updated instance details
    }
   
};

const updateAwsLabInstanceDetails = async (lab_id, state, isStarted) => {

    if(!isStarted){
        const result = await pool.query(queries.UPDATE_LAB_INSTANCE_STATES, [true,state, lab_id]);
        return result.rows[0];
    }
    else{
    const result = await pool.query(queries.UPDATE_LAB_INSTANCE_STATE, [state, lab_id]);
    return result.rows[0]; // Return updated lab instance details
    }
};

const assignLabBatch = async (lab_id, admin_id, org_id, configured_by, enddate) => {
    const existingRecord = await pool.query(queries.CHECK_LAB_ASSIGNMENT, [lab_id, admin_id, org_id]);

    if (existingRecord.rows.length > 0) {
        return { assigned: true, data: existingRecord.rows[0] };
    }

    const batch = await pool.query(queries.INSERT_LAB_BATCH, [lab_id, admin_id, org_id, configured_by, enddate]);

    return { assigned: false, data: batch.rows[0] };
};

const getLabBatchAssessment = async (admin_id) => {
    const data = await pool.query(queries.GET_LAB_BATCH_BY_ADMIN, [admin_id]);
    if(!data.rows.length){
        return [];
    }
    
    return data.rows;
};

//update user single vm lab timings
const updateUserLabTimingsOfSingleVMDatacenter = async(labId,identifier,startTime,endTime,type)=>{
    try {
        let response;
        if(type === 'org'){
            
             response = await pool.query(labQueries.UPDATE_SINGLEVM_DATACENTER_ORG_LAB_TIME,[startTime,endTime,labId,identifier]);
        }
        else{
            response = await pool.query(labQueries.UPDATE_SINGLEVM_DATACENTER_USER_LAB_TIME,[startTime,endTime,labId,identifier]);
        }
         
        if(!response.rows.length){
            throw new Error(`No lab found for this user`)
        }
        return response.rows;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

//update the aws single vm
const updateUserLabTimingsOfAwsSingleVMDatacenter = async(labId,identifier,startTime,endTime,type)=>{
    try {
        let response;
        if(type === 'org'){
            response = await pool.query(labQueries.UPDATE_SINGLEVM_AWS_ORG_LAB_TIME,[startTime,endTime,labId,identifier]);
        }
        else{
            response = await pool.query(labQueries.UPDATE_SINGLEVM_AWS_USER_LAB_TIME,[startTime,endTime,labId,identifier]);
        }
        
        if(!response.rows.length){
            throw new Error(`No lab found for this user`)
        }
        return response.rows;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

const getSoftwareDetails = async () => {
    const data = await pool.query(queries.GET_ALL_SOFTWARE_DETAILS);
    return data.rows;
};

const checkLabBatchAssessment = async (admin_id, org_id) => {
    const data = await pool.query(queries.CHECK_LAB_BATCH_ASSESSMENT, [admin_id, org_id]);
    return data.rows;
};

const getLabsConfigured = async (admin) => {
    const labs = await pool.query(labQueries.GET_CONFIGURED_LABS, [admin]);
    // console.log("Labs Configured:", labs.rows);
    return labs.rows;
  };

// Get Lab Catalogues
const getLabCatalogues = async () => {
    const result = await pool.query(labQueries.GET_LAB_CATALOGUES);
    return result.rows;
  };

  const updateAwsInstanceDetailsOfUsersService = async (state, labId, userId) => {
    try {
      const response = await pool.query(queries.UPDATE_AWS_INSTANCE_DETAILS, [state, labId, userId]);
      return response.rows[0] || null;
    } catch (error) {
      throw error;
    }
  };
  
  const updateAwsLabInstanceDetailsService = async (state, labId) => {
    try {
      const response = await pool.query(queries.UPDATE_AWS_LAB_INSTANCE_DETAILS, [state, labId]);
      return response.rows[0] || null;
    } catch (error) {
      throw error;
    }
  };

  const checkIsStartedService = async (type, id) => {
    if (!type || !id) {
      throw new Error("Type and ID are required.");
    }
  
    let query;
    if (type === "lab") {
      query = queries.CHECK_LAB_INSTANCE_STARTED;
    } else if (type === "user") {
      query = queries.CHECK_USER_INSTANCE_STARTED;
    } else {
      throw new Error("Invalid type. Use 'lab' or 'user'.");
    }
  
    const result = await pool.query(query, [id]);
  
    if (!result.rows[0]) {
      throw new Error("No record found.");
    }
  
    return { success: true, message: "Successful", isStarted: result.rows[0].isstarted };
  };
  
  const createNewCatalogue = async (catalogueData) => {
    try {
      const {
        name,
        cpu,
        ram,
        storage,
        instance,
        snapshotType,
        os,
        os_version,
        platform,
        provider,
        description,
        duration,
        user,
      } = catalogueData;
  
      const values = [
        user,
        instance,
        platform,
        provider,
        os,
        os_version,
        cpu,
        ram,
        storage,
        instance,
        name,
        description,
        duration,
        snapshotType,
      ];
  
      const result = await pool.query(queries.CREATE_CATALOGUE, values);
  
      if (!result.rows[0]) {
        throw new Error("Could not store the lab catalogue");
      }
  
      return result.rows[0];
    } catch (error) {
      console.error("Error in createNewCatalogue service:", error.message);
      throw error;
    }
  };

  const getOperatingSystems = async () => {
    try {
        const result = await pool.query(labQueries.GET_OPERATING_SYSTEMS);

        if (result.rowCount === 0) {  // ✅ Safer check
            return { success: false, message: "Could not get the operating systems", data: null };
        }

        return { success: true, message: "Successfully accessed the operating systems list", data: result.rows };
    } catch (error) {
        console.error("Database Query Error:", error); // ✅ Logs full error stack
        throw new Error("Database error: " + error.message);
    }
};

 const updateSigleVmLabStatus = async(labId,status)=>{
     try {
        const result = await pool.query(queries.UPDATE_LAB_STATUS,[status,labId]);
        return result.rows[0]; // Return the updated lab status
     } catch (error) {
        throw new Error("Error in updating the lab status:",error.message);
     }
 }

//get count of labs
const getCount = async (userId, user) => {
  try {
    let result;

    if (user.role === 'superadmin' || user.role === 'orgsuperadmin') {
      result = await pool.query(queries.GET_COUNT, [userId]);
    } else if (user.role === 'orgadmin') {
      result = await pool.query(queries.GET_ORG_LAB_COUNT, [userId,user.org_id]);
    } else {
      throw new Error("Invalid user role");
    }

    return result.rows[0]; // Return the count of labs
  } catch (error) {
    console.error("Error in getCount service:", error.message);
    throw error;
  }
};


//get cloudslicelabs of organization assigned
const getCloudSliceOrgLabs = async (orgId) => {
    try {
      const result = await pool.query(queries.GET_ALL_CLOUDSLICE_LABS_ORG, [orgId]);
  
      if (!result.rows.length) {
        throw new Error("No labs found for this organization");
      }
  
      const labs = [];
      
      for (const row of result.rows) {
        const labDetails = await pool.query(labQueries.GET_CLOUDSLICE_LABS_LABID, [row.labid]);
        labs.push(labDetails.rows[0]);
      }
      return labs;
    } catch (error) {
      console.log(error.message);
      throw new Error("Error in getting the Labs");
    }
  };
  

module.exports = {
    createLab,
    getAllLab,
    getLabOnId,
    assignLab,
    getAssignLabOnId,
    getInstanceOnParameters,
    getInstanceDetailsForPricing,
    updateLabConfig,
    getAmiInformation,
    getAwsInstanceDetails,
    getAwsInstanceDetailsOfUsers,
    updateAwsInstanceDetailsOfUsers,
    updateAwsLabInstanceDetails,
    assignLabBatch,
    getLabBatchAssessment,
    getSoftwareDetails,
    checkLabBatchAssessment,
    getLabsConfigured,
    getLabCatalogues,
    updateAwsInstanceDetailsOfUsersService,
    updateAwsLabInstanceDetailsService,
    getAmiInformation,
    checkIsStartedService,
    createNewCatalogue,
    getOperatingSystems,
    getAssignLabOnLabId,
    updateSigleVmLabStatus,
    getCount,
    getCloudSliceOrgLabs,
    createSingleVmDatacenterLab,
    getDatacenterLabsOnAdminId,
    getDatacenterLabCredentials,
    updateSingleVmDatacenterLab,
    createDatacenterLabOrgAssignment,
    assignSingleVmDatacenterCredsToOrg,
    editSingleVmDatacenterCreds,
    deleteSingleVmDatacenterLab,
    updateSingleVmDatacenterCredsDisable,
    getOrgAssignedsingleVMDatacenterLab,
    getDatacenterLabsOnLabId,
    assignSingleVmDatacenterLabToUser,
    getUserAssignedSingleVMDatacenterLabs,
    getUserAssignedSingleVMDatacenterCredsToUser,
    connectToVm,
    updateSingleVMDatacenterUserCredRunningState,
    deleteSingleVMDatacenterLabForUser,
    deleteSingleVMDatacenterLabFromOrg,
    updateSingleVMDatacenterLab,
    getAllSingleVMDatacenterLabs,
    updateUserLabTimingsOfSingleVMDatacenter,
    updateSingleVMAws,
    updateUserLabTimingsOfAwsSingleVMDatacenter,
    getAllLabCatalogues,
    deleteCatalogue,
    updateCatalogueDetails,
    getUserPurchasedSinglvmLabs,
    updateSingleVMAwsLab
}