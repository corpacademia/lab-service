module.exports = {
    CREATE_LAB :`
    INSERT INTO createlab 
    (user_id,type,platform,provider,os,os_version,cpu,ram,storage,instance,title,description,duration,snapshot_type,labguide,userguide,guacamole_name,guacamole_url) 
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) 
    RETURNING *
    `,
    INSERT_DATACENTER_LAB:`
    INSERT INTO singlevmdatacenter_lab
    ( user_id, title, description, type, platform,startdate,enddate, labguide, userguide ,protocol,guacamole_name,guacamole_url)
    VALUES ($1, $2, $3, $4, $5,$6, $7,$8,$9,$10,$11,$12)
    RETURNING *
    `,
    INSERT_DATACENTER_VM_CREDS:`INSERT INTO datacenter_lab_user_credentials (labid, username, password, ip, port, protocol)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    INSERT_DATACENTER_VM_ORGASSIGNMENT:`INSERT INTO singlevmdatacenterorgassignment(labid,orgid,admin_id,assigned_by,startdate,enddate) VALUES ($1, $2, $3 ,$4,$5,$6) RETURNING *`,
    INSERT_DATACENTER_VM_USERASSIGNMENT:`INSERT INTO singlevmdatacenteruserassignment(labid,user_id,assigned_by,startdate,enddate,creds_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    GET_ALL_LAB:`
     SELECT * FROM createlab
    `,
    GET_LAB_ON_ID:`
    SELECT * from createlab where lab_id=$1
    `,
    GET_DATACENTER_LAB_ON_ADMIN_ID:`
    SELECT * FROM singlevmdatacenter_lab WHERE user_id=$1
    `,
    GET_DATACENTER_LAB_ON_LAB_ID:`
    SELECT * FROM singlevmdatacenter_lab WHERE lab_id=$1
    `,
    GET_USER_PURCHASED_SINGLEVM_AWS:`SELECT * FROM singlevm_aws_purchased_labs where user_id=$1`,
    GET_USERASSIGNED_SINGLEVM_DATACENTER_LAB:`SELECT * FROM singlevmdatacenteruserassignment where  user_id=$1`,
    CHECK_USERASSIGNED_SINGLEVM_DATACENTER_LAB:`SELECT * FROM singlevmdatacenteruserassignment where labid=$1 and  user_id=$2`,
    GET_DATACENTER_LAB_CREDS:`SELECT * FROM datacenter_lab_user_credentials WHERE labid=$1`,
    GET_DATACENTER_LAB_CREDS_ONID:`SELECT * FROM datacenter_lab_user_credentials WHERE id=$1`,
    GET_DATACENTER_LAB_CREDS_TOUSER:`SELECT * FROM datacenter_lab_user_credentials WHERE labid=$1 AND assigned_to=$2`,
    GET_DATACENTER_LAB_CREDS_ONLABID:`SELECT * FROM datacenter_lab_user_credentials WHERE labid=$1 AND orgassigned is NULL AND admin_id is NULL`,

    UPDATE_SINGLEVM_AWS_CONTENT:`UPDATE createlab SET title=$1,description=$2,cpu=$3,ram=$4,os=$5,provider=$6,instance=$7,software=$8,labguide=$9,userguide=$10,enddate=$11 WHERE lab_id=$12 RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER:`UPDATE singlevmdatacenter_lab SET  software=$1, cataloguetype=$2,cataloguename=$4,level=$5,category=$6,price=$7 where lab_id=$3 RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER_CONTENT:`UPDATE singlevmdatacenter_lab SET title=$1,description=$2,startdate=$3,enddate=$4,labguide=$5,userguide=$6,software=$7 where lab_id=$8 RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER_CREDS:`UPDATE datacenter_lab_user_credentials SET orgassigned=$1,assigned_by=$2,admin_id=$4 WHERE labid=$3 and orgassigned is NULL and admin_id is NULL RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER_CREDS_RUNNINGSTATE:`UPDATE singlevmdatacenteruserassignment SET isrunning=$1 WHERE user_id=$2 and labid=$3 RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER_USER_STATUS:`UPDATE singlevmdatacenteruserassignment SET status=$1 WHERE user_id=$2 and labid=$3 RETURNING *`,
    
    UPDATE_SINGLEVM_DATACENTER_USER_LAB_TIME:`UPDATE singlevmdatacenteruserassignment SET startdate=$1,enddate=$2 WHERE user_id=$4 and labid=$3 RETURNING *`,
     UPDATE_SINGLEVM_DATACENTER_ORG_LAB_TIME:`UPDATE singlevmdatacenterorgassignment SET startdate=$1,enddate=$2 WHERE orgid=$4 and labid=$3 RETURNING *`,
    UPDATE_SINGLEVM_AWS_USER_LAB_TIME:`UPDATE labassignments SET start_date=$1,completion_date=$2 WHERE user_id=$4 and lab_id=$3 RETURNING *`,
     UPDATE_SINGLEVM_AWS_ORG_LAB_TIME:`UPDATE lab_batch SET startdate=$1,enddate=$2 WHERE org_id=$4 and lab_id=$3 RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER_CREDS_ASSIGNMENT:`WITH to_update AS (
      SELECT id
      FROM datacenter_lab_user_credentials
      WHERE labid = $2 AND orgassigned = $3 and assigned_to is  NUll
      LIMIT 1
    )
    UPDATE datacenter_lab_user_credentials AS d
    SET assigned_to = $1
    FROM to_update
    WHERE d.id = to_update.id
    RETURNING d.*;
    ;
        `,
    UPDATE_SINGLEVM_DATACENTER_CREDS_ASSIGNMENT_FOR_RANDOM_USER:`WITH to_update AS (
        SELECT id
        FROM datacenter_lab_user_credentials
        WHERE labid = $2 AND orgassigned  is NULL and assigned_to is  NUll
        LIMIT 1
      )
      UPDATE datacenter_lab_user_credentials AS d
      SET assigned_to = $1
      FROM to_update
      WHERE d.id = to_update.id
      RETURNING d.*;
      ;
          `,

    GET_ALL_CATALOGUES:`
    SELECT 
        cl.lab_id as id,
        cl.cataloguename AS title,
        cl.description,
        cl.level,
        cl.category,
        cl.number_days::INTEGER AS duration,
        cl.user_id,
        cl.price,
        'singlevm-aws' AS type,
        CASE
          WHEN cl.enddate > NOW() THEN 'available'
          ELSE 'not available'
        END AS software,
        CASE 
          WHEN cl.price::Float <= 0 THEN true 
          ELSE false 
        END AS isFree,
        COALESCE(u.organization, ou.organization) AS provider
      FROM createlab cl
      LEFT JOIN users u ON cl.user_id = u.id
      LEFT JOIN organization_users ou ON cl.user_id = ou.id
      WHERE cl.cataloguetype = 'public'

      UNION ALL

      -- singlevmdatacenter_lab
      SELECT 
        s.lab_id AS id,
        s.cataloguename AS title,
        s.description,
        s.level,
        s.category,
        DATE_PART('day', s.enddate - s.startdate) AS duration,
        s.user_id,
        s.price,
        'singlevmdatacenter' AS type,
        'available' AS software,
        CASE 
          WHEN s.price::Float <= 0 THEN true 
          ELSE false 
        END AS isFree,
        COALESCE(u.organization, ou.organization) AS provider
      FROM singlevmdatacenter_lab s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN organization_users ou ON s.user_id = ou.id
      WHERE s.cataloguetype = 'public'

      UNION ALL

      -- vmclusterdatacenter_lab
      SELECT 
        v.labid AS id,
        v.cataloguename AS title,
        v.description,
        v.level,
        v.category,
        DATE_PART('day', v.enddate - v.startdate) AS duration,
        v.user_id,
        v.price,
        'vmclusterdatacenter' AS type,
        'available' AS software,
        CASE 
          WHEN v.price::Float <= 0 THEN true 
          ELSE false 
        END AS isFree,
        COALESCE(u.organization, ou.organization) AS provider
      FROM vmclusterdatacenter_lab v
      LEFT JOIN users u ON v.user_id = u.id
      LEFT JOIN organization_users ou ON v.user_id = ou.id
      WHERE v.cataloguetype = 'public'

      UNION ALL

      -- cloudslicelab
      SELECT 
        c.labid AS id,
        c.cataloguename AS title,
        c.description,
        c.level,
        c.category,
        DATE_PART('day', c.enddate - c.startdate) AS duration,
        c.createdby AS user_id,
        c.price,
        'cloudslice' AS type,
        'available' AS software,
        CASE 
          WHEN c.price::Float <= 0 THEN true 
          ELSE false 
        END AS isFree,
        COALESCE(u.organization, ou.organization) AS provider
      FROM cloudslicelab c
      LEFT JOIN users u ON c.createdby = u.id
      LEFT JOIN organization_users ou ON c.createdby = ou.id
      WHERE c.cataloguetype = 'public';
      `,

            UPDATE_CREATELAB_CATALOGUE: `
            UPDATE createlab
            SET cataloguetype = 'private'
            WHERE lab_id = $1;
            `,
            UPDATE_SINGLEVM_CATALOGUE: `
            UPDATE singlevmdatacenter_lab
            SET cataloguetype = 'private'
            WHERE lab_id = $1;
            `,
            UPDATE_VMCLUSTER_CATALOGUE: `
            UPDATE vmclusterdatacenter_lab
            SET cataloguetype = 'private'
            WHERE labid = $1;
            `,
            UPDATE_CLOUDSLICE_CATALOGUE: `
            UPDATE cloudslicelab
            SET cataloguetype = 'private'
            WHERE labid = $1;
            `,

            UPDATE_CREATELAB_CATALOGUE_DETAILS: `
          UPDATE createlab
          SET category = $2,
              description = $3,
              price = $4,
              level = $5,
              cataloguename = $6
          WHERE lab_id = $1 RETURNING *;
        `,

UPDATE_SINGLEVM_CATALOGUE_DETAILS: `
  UPDATE singlevmdatacenter_lab
  SET category = $2,
      description = $3,
      price = $4,
      level = $5,
      cataloguename = $6
  WHERE lab_id = $1 RETURNING *;
`,

UPDATE_VMCLUSTER_CATALOGUE_DETAILS: `
  UPDATE vmclusterdatacenter_lab
  SET category = $2,
      description = $3,
      price = $4,
      level = $5,
      cataloguename = $6
  WHERE labid = $1 RETURNING *;
`,

UPDATE_CLOUDSLICE_CATALOGUE_DETAILS: `
  UPDATE cloudslicelab
  SET category = $2,
      description = $3,
      price = $4,
      level = $5,
      cataloguename = $6
  WHERE labid = $1 RETURNING *;
`,

   
    EDIT_SINGLEVM_DATACENTER_CREDS:`UPDATE datacenter_lab_user_credentials SET username=$1, password=$2, ip=$3, port=$4, protocol=$5 WHERE id=$6 AND labid=$7 RETURNING *`,
    GET_CONFIG_DETAILS: `SELECT config_details FROM lab_batch WHERE lab_id=$1 AND admin_id=$2`,
    GET_CONFIG_DETAILS_RANDOM_USER: `SELECT config_details FROM lab_batch WHERE lab_id=$1 `,
    CHECK_ALREADY_ASSIGNED: `SELECT * FROM labassignments WHERE user_id=$1 AND lab_id=$2`,
    ASSIGN_LAB: `
        INSERT INTO labassignments (lab_id, user_id, start_date, completion_date, assigned_admin_id) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *`,
        GET_ASSIGNED_LABS: `SELECT * FROM labassignments WHERE user_id=$1`,
        GET_ASSIGNED_PURCHASED_LABS: `SELECT * FROM singlevm_aws_purchased_labs WHERE user_id=$1`,
    
    GET_INSTANCES_DETAILS: (table) => `SELECT * FROM ${table} WHERE vcpu=$1 AND memory=$2`,
    GET_INSTANCE_DETAILS_FOR_PRICING: (table, instancename) => `
        SELECT * 
        FROM ${table} 
        WHERE REPLACE(${instancename}, E'\n', '') = $1 
        AND vcpu = $2 
        AND memory = $3
    `,
    UPDATE_LAB_CONFIG:`
    INSERT INTO lab_configurations (lab_id, admin_id, config_details) 
    VALUES ($1, $2, $3) 
    RETURNING *`,
    GET_AMI_INFO: `SELECT * FROM amiinformation WHERE lab_id=$1`,
    GET_INSTANCE_DETAILS: `SELECT * FROM instances WHERE lab_id=$1`,
    GET_USER_INSTANCE_DETAILS: `SELECT * FROM cloudassignedinstance WHERE lab_id=$1 AND user_id=$2`,
    UPDATE_USER_INSTANCE_STATE: `UPDATE cloudassignedinstance SET isRunning=$1 WHERE lab_id=$2 AND user_id=$3 RETURNING *`,
    UPDATE_USER_INSTANCE_STATES: `UPDATE cloudassignedinstance SET isstarted=$1 , isRunning=$2 WHERE lab_id=$3 AND user_id=$4 RETURNING *`,
    UPDATE_USER_SINGLEvM_AWS_STATUS:`UPDATE labassignments SET status=$1 WHERE lab_id=$2 AND user_id=$3 RETURNING *`,
    UPDATE_USER_SINGLEvM_AWS_PURCHASED_STATUS:`UPDATE singlevm_aws_purchased_labs SET status=$1 WHERE labid=$2 AND user_id=$3 RETURNING *`,
    UPDATE_LAB_INSTANCE_STATE: `UPDATE instances SET isRunning=$1 WHERE lab_id=$2 RETURNING *`,
    UPDATE_LAB_INSTANCE_STATES: `UPDATE instances SET isstarted=$1, isRunning=$2 WHERE lab_id=$3 RETURNING *`,
    UPDATE_SINGLEVM_DATACENTER_CREDS_DISABLE:`UPDATE datacenter_lab_user_credentials set disabled=$1 where id = $2 RETURNING *`,
    CHECK_LAB_ASSIGNMENT: `SELECT * FROM lab_batch WHERE lab_id = $1 AND admin_id = $2 AND org_id = $3`,
    INSERT_LAB_BATCH: `INSERT INTO lab_batch(lab_id, admin_id, org_id, configured_by,enddate,startdate,assigned_at) 
                       VALUES($1, $2, $3, $4, $5,NOW(),NOW()) RETURNING *`,
    GET_SINGLEVM_DATACENTER_ORG:`SELECT * FROM singlevmdatacenterorgassignment where  orgid=$1 and admin_id=$2`,
    GET_SINGLEVM_DATACENTER_ORG_LAB:`SELECT * FROM singlevmdatacenterorgassignment where labid=$1 and  orgid=$2 and admin_id=$3`,
    GET_LAB_BATCH_BY_ADMIN: `SELECT * FROM lab_batch WHERE admin_id=$1`,
    GET_ALL_SOFTWARE_DETAILS: `SELECT * FROM createlab`,
    CHECK_LAB_BATCH_ASSESSMENT: `SELECT * FROM lab_batch WHERE admin_id=$1 AND org_id=$2`,
    GET_CONFIGURED_LABS: `
    SELECT cl.* 
    FROM createlab cl
    INNER JOIN instances ic 
    ON cl.lab_id = ic.lab_id
    where cl.user_id = $1
  `,
  GET_LAB_CATALOGUES: `
  SELECT * 
  FROM createlab l 
  INNER JOIN lab_configurations lc 
  ON l.lab_id = lc.lab_id 
  WHERE lc.config_details->>'catalogueType' = 'public'
`,

CHECK_LAB_INSTANCE_STARTED: "SELECT isstarted FROM instances WHERE instance_id = $1",
CHECK_USER_INSTANCE_STARTED: "SELECT isstarted FROM cloudassignedinstance WHERE instance_id = $1",

CREATE_CATALOGUE: `
    INSERT INTO createlab 
    (user_id, type, platform, provider, os, os_version, cpu, ram, storage, instance, title, description, duration, snapshot_type) 
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) 
    RETURNING *`,
    GET_OPERATING_SYSTEMS: 'SELECT * FROM operating_systems',
    GET_ASSIGNED_LABS_ON_LABID:"SELECT * from labassignments where lab_id=$1 and user_id=$2",
    GET_ASSIGNED_PURCHASED_LABS_ON_LABID:"SELECT * from singlevm_aws_purchased_labs where labid=$1 and user_id=$2",
UPDATE_LAB_STATUS: `UPDATE createlab SET status=$1 WHERE lab_id=$2 RETURNING *`,
UPDATE_SINGLEVM_AWS:`UPDATE createlab SET cataloguename=$1,cataloguetype=$2,number_days=$3,number_hours_day=$4,software=$5,enddate=$6,level=$8,category=$9,price=$10 where lab_id=$7 RETURNING *`,

GET_COUNT: `
SELECT json_object_agg(table_name, row_count) AS counts
FROM (
  SELECT 'workspace' AS table_name, COUNT(*) AS row_count FROM workspace WHERE created_by = $1

  UNION ALL

  SELECT 'cloud-vm' AS table_name, COUNT(*) AS row_count
  FROM (
    SELECT lab_id FROM createlab WHERE user_id = $1
    UNION ALL
    SELECT lab_id FROM singlevmdatacenter_lab WHERE user_id = $1
  ) AS combined

  UNION ALL
  select 'cluster' AS table_name, COUNT(*) AS row_count FROM vmclusterdatacenter_lab WHERE user_id = $1

  UNION ALL
  SELECT 'cloud-slice' AS table_name, COUNT(*) AS row_count FROM cloudslicelab WHERE createdby = $1
) AS subquery;
`,
GET_ORG_LAB_COUNT: `
SELECT json_object_agg(table_name, row_count) AS counts
FROM (
  SELECT 'workspace' AS table_name, COUNT(*) AS row_count 
  FROM workspace 
  WHERE created_by = $1

  UNION ALL

  SELECT 'cloud-vm' AS table_name, COUNT(*) AS row_count
  FROM (
    SELECT lab_id FROM labassignments WHERE user_id = $1
    UNION ALL
    SELECT labid FROM singlevmdatacenterorgassignment WHERE orgid = $2
  ) AS combined

  UNION ALL

  SELECT 'cluster' AS table_name, COUNT(*) AS row_count 
  FROM vmclusterdatacenterorgassignment 
  WHERE orgid = $2

  UNION ALL

  SELECT 'cloud-slice' AS table_name, COUNT(*) AS row_count 
  FROM cloudsliceorgassignment 
  WHERE orgid = $2
) AS subquery;
`,
GET_ALL_CLOUDSLICE_LABS_ORG:`Select * from cloudsliceorgassignment where orgid=$1`,
GET_CLOUDSLICE_LABS_LABID: `select * from cloudslicelab where labid=$1`,

GET_SINGLE_VM_DATACENTER:`SELECT * FROM singlevmdatacenter_lab where user_id=$1`,

DELETE_SINGLEVM_DATACENTER_LAB:`DELETE FROM singlevmdatacenter_lab where lab_id=$1`,
DELETE_SINGLEVM_DATACENTER_CREDS:`DELETE FROM datacenter_lab_user_credentials where labid=$1`,
DELETE_SINGLEVM_DATACENTER_CREDS_ONID:`DELETE FROM datacenter_lab_user_credentials where id=$1`,
DELETE_SINGLEVM_DATACENTER_ORGASSINGMENT:`DELETE FROM singlevmdatacenterorgassignment WHERE labid=$1`,
DELETE_SINGLEVM_DATACENTER_USERASSIGNMENT:`DELETE FROM singlevmdatacenteruserassignment WHERE labid=$1`,

DELETE_SINGLEVM_DATACENTER_FROM_USER:`DELETE FROM singlevmdatacenteruserassignment where labid=$1 and user_id=$2`,
DELETE_USER_CRED_FROM_CREDS: `UPDATE datacenter_lab_user_credentials set assigned_to=$1 where assigned_to=$2`,
DELETE_SINGLEVM_DATACENTER_ORGASSINGMENT_FROM_ORG:`DELETE FROM singlevmdatacenterorgassignment WHERE labid=$1 AND orgid=$2`,
DELETE_SINGLEVM_DATACENTER_CREDS_FROM_ORG:`UPDATE datacenter_lab_user_credentials SET assigned_to=$1,orgassigned=$2 where orgassigned=$3`,

GET_ORG_USER:`SELECT email FROM organization_users WHERE id = $1`,
GET_USER:`SELECT email FROM users WHERE id = $1`,
GET_LAB_DETAILS:`SELECT 
    lab_id,
    title,
    description,
    cataloguename,
    'createlab' AS source
FROM createlab
WHERE lab_id = $1

UNION ALL

SELECT 
    lab_id,
    title,
    description,
    cataloguename,
    'singlevmdatacenter_lab' AS source
FROM singlevmdatacenter_lab
WHERE lab_id = $1;
`,
//single vm aws status update
GET_STATUS_OF_SINGLEVM_LAB:`SELECT lab_id, status FROM createlab
      WHERE enddate < NOW() AND status != 'expired'`,
INSERT_LAB_STATUS_LOGS:`INSERT INTO lab_status_logs (labid, lab_type,type, previous_status, new_status,change_reason)
        VALUES ($1, $2, $3, $4,$5,$6)`,
GET_STATUS_OF_SINGLEVM_ORGLAB:`SELECT lab_id, status FROM lab_batch
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_OF_SINGLEVM_USERLAB:`SELECT lab_id, status FROM labassignments
      WHERE completion_date < NOW() AND status != 'expired'`,

//single vm datacenter status update
GET_STATUS_SINGLEVM_DATACENTER_LAB:`SELECT lab_id, status FROM singlevmdatacenter_lab
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_SINGLEVM_DATACENTER_ORG:`SELECT labid, status FROM singlevmdatacenterorgassignment
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_SINGLEVM_DATACENTER_USER:`SELECT labid, status FROM singlevmdatacenteruserassignment
      WHERE enddate < NOW() AND status != 'expired'`,

//vmcluster datacenter status update
GET_STATUS_VMCLUSTER_DATACENTER_LAB:`SELECT labid, status FROM vmclusterdatacenter_lab
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_VMCLUSTER_DATACENTER_ORG:`SELECT labid, status FROM vmclusterdatacenterorgassignment
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_VMCLUSTER_DATACENTER_USER:`SELECT labid, status FROM vmclusterdatacenteruserassignment
      WHERE enddate < NOW() AND status != 'expired'`,

GET_STATUS_CLOUDSLICE_LAB:`SELECT labid, status FROM cloudslicelab
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_CLOUDSLICE_ORG:`SELECT labid, status FROM cloudsliceorgassignment
      WHERE enddate < NOW() AND status != 'expired'`,
GET_STATUS_CLOUDSLICE_USER:`SELECT labid, status FROM cloudsliceuserassignment
      WHERE end_date < NOW() AND status != 'expired'`,
GET_STATUS_CLOUDSLICE_USER_PURCHASED:`SELECT labid, status FROM cloudslice_purchased_labs
      WHERE end_date < NOW() AND status != 'expired'`,

//modulat lab status
GET_CLOUDSLICE_MODULAR_LAB :`SELECT * FROM cloudslicelab where modules='with-modules'`,
GET_MODULES:`SELECT * FROM modules where lab_id=$1`,
GET_EXERCISES_MODULE:`SELECT * FROM exercises where module_id=$1`,
GET_LABEXERCISE_DATA:`SELECT DISTINCT ON (user_id) *
FROM cloudsliceuserlabexercisestatus
WHERE module_id = $1;
`,
GET_IS_LAB_COMPLETED:`SELECT *,
  BOOL_AND(status = 'completed') OVER (PARTITION BY user_id, module_id) AS has_all_completed_status
FROM 
  cloudsliceuserlabexercisestatus
WHERE 
  user_id = $1 AND module_id = $2;

`,
GET_IS_QUIZ_COMPLETED:`SELECT *,
  BOOL_AND(status = 'completed') OVER (PARTITION BY user_id, module_id) AS has_all_completed_status
FROM 
  cloudsliceuserquizexercisestatus
WHERE 
  user_id = $1 AND module_id = $2;
`,
INSERT_MODULE_STATUS_USER_LAB:`INSERT INTO cloudsliceusermodulestatus (user_id, labid, module_id, status)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, module_id)
DO UPDATE SET status = EXCLUDED.status;
`,
GET_ALL_USER_CLOUDSLICE_LABS:`SELECT * FROM cloudsliceuserassignment where labid=$1`,
GET_ALL_USER_CLOUDSLICE_PURCHASED_LABS:`SELECT * FROM cloudslice_purchased_labs where labid=$1`,
GET_LAB_MODULAR_STATUS_USER:`SELECT 
BOOL_AND(status = 'completed') AS has_all_completed_status
FROM cloudsliceusermodulestatus WHERE labid = $1 AND user_id = $2
`,

//lab status auto update based on enddate
UPDATE_SINGLEvM_AWS_LAB_STATUS:`UPDATE createlab set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_SINGLEvM_AWS_ORG_STATUS:`UPDATE lab_batch set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_SINGLEvM_AWS_USER_STATUS:`UPDATE labassignments set status = 'expired' where completion_date<NOW() and status!='expired'`,
UPDATE_SINGLEVM_DATACENTER_LAB_STATUS:`UPDATE singlevmdatacenter_lab set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_SINGLEVM_DATACENTER_ORG_STATUS:`UPDATE singlevmdatacenterorgassignment set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_SINGLEVM_DATACENTER_USER_STATUS:`UPDATE singlevmdatacenteruserassignment set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_VMCLUSTER_DATACENTER_LAB_STATUS:`UPDATE vmclusterdatacenter_lab set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_VMCLUSTER_DATACENTER_ORG_STATUS:`UPDATE vmclusterdatacenterorgassignment set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_VMCLUSTER_DATACENTER_USER_STATUS:`UPDATE vmclusterdatacenteruserassignment set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_cloudslice_LAB_STATUS:`UPDATE cloudslicelab set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_cloudslice_ORG_STATUS:`UPDATE cloudsliceorgassignment set status = 'expired' where enddate<NOW() and status!='expired'`,
UPDATE_cloudslice_USER_STATUS:`UPDATE cloudsliceuserassignment set status = 'expired' where end_date<NOW() and status!='expired'`,
UPDATE_cloudslice_USER_PURCHASED_STATUS:`UPDATE cloudslice_purchased_labs set status = 'expired' where end_date<NOW() and status!='expired'`,
UPDATE_CLOUDSLICE_USER_MODULAR:`UPDATE cloudsliceuserassignment set status=$1 where user_id = $2 and labid=$3`,
UPDATE_CLOUDSLICE_USER_PURCHASED_MODULAR:`UPDATE cloudslice_purchased_labs set status=$1 where user_id = $2 and labid=$3`,


//get notifications of user
GET_NOTIFICATIONS_USER:`SELECT * FROM notifications where user_id=$1 order by  created_at DESC`,
//get lab software expiry
GET_STATUS_OF_SOFTWARE_EXPIRY: `
  SELECT c.*
FROM createlab c
LEFT JOIN lab_notifications ln 
    ON c.lab_id = ln.lab_id 
   AND ln.notification_type = 'expiry'
    AND ln.expiry_date = enddate
WHERE c.enddate >= NOW() + INTERVAL '1 day'
  AND c.enddate < NOW() + INTERVAL '1 day 2 minutes'
  AND ln.id IS NULL; -- means no expiry notification sent yet
`,
GET_STATUS_OF_SOFTWARE_EXPIRY_SINGLEVM_DATACENTER:`
  SELECT c.*
FROM singlevmdatacenter_lab c
LEFT JOIN lab_notifications ln 
    ON c.lab_id = ln.lab_id 
   AND ln.notification_type = 'expiry'
   AND ln.expiry_date = enddate
WHERE c.enddate >= NOW() + INTERVAL '1 day'
  AND c.enddate < NOW() + INTERVAL '1 day 2 minutes'
  AND ln.id IS NULL; -- means no expiry notification sent yet
`,
GET_USER_NOTIFICATION_SETTINGS:`SELECT * FROM user_notification_settings WHERE user_id = $1`,

//insert into lab notifications
INSERT_LAB_NOTIFICATION:`INSERT INTO lab_notifications (lab_id,notification_type,expiry_date,notification_id) VALUES($1,$2,$3,$4) RETURNING *`,
INSERT_NOTIFICATION_PREFERENCES:`INSERT INTO user_notification_settings (
  user_id,
  emailnotifications,
  inappnotifications,
  email_digest,
  quiet_hours_enabled,
  quiet_start,
  quiet_end,
  timezone,
  daily_send_hour,
  weekly_send_day
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,$10)
ON CONFLICT (user_id)
DO UPDATE SET
  emailnotifications = EXCLUDED.emailnotifications,
  inappnotifications = EXCLUDED.inappnotifications,
  email_digest = EXCLUDED.email_digest,
  quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
  quiet_start = EXCLUDED.quiet_start,
  quiet_end = EXCLUDED.quiet_end,
  timezone = EXCLUDED.timezone,
  daily_send_hour = EXCLUDED.daily_send_hour,
  weekly_send_day = EXCLUDED.weekly_send_day;
`,
//insert to notifications
INSERT_NOTIFICATION:`INSERT INTO notifications (type,title,message,priority,user_id,metadata) values($1,$2,$3,$4,$5,$6) RETURNING *`,

UPDATE_EMAIL_SENT_STATUS:`UPDATE notifications SET email_sent=true where id=$1 RETURNING *`,
UPDATE_STATUS_AS_READ:`UPDATE notifications SET is_read=true where id=$1 RETURNING *`,
UPDATE_STATUS_ALL_READ:`UPDATE notifications
       SET is_read = true
       WHERE user_id = $1
       RETURNING *`,
GET_NOTIFICATION_PREFERENCES_USERS:`SELECT * FROM user_notification_settings `,
GET_NOTIFICATION_PREFERENCES:`SELECT * FROM user_notification_settings WHERE user_id = $1`,
GET_NOTIFICATIONS_TYPE:`SELECT * FROM notifications where user_id=$1 and type=$2 order by  created_at DESC`,
GET_PENDING_NOTIFICATIONS_FOR_USER:`SELECT * FROM notifications where user_id=$1 and email_sent=false order by  created_at DESC`,

DELETE_NOTIFICATION:`DELETE FROM notifications where id=$1 RETURNING *`,


}