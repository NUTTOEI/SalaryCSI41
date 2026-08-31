USE `railway`;

DROP TABLE IF EXISTS `members`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `branches`;

CREATE TABLE `branches` (
	`branch_code` VARCHAR(100) PRIMARY KEY,
    `branch_name` VARCHAR(255) NOT NULL,
    `profile_img` VARCHAR(255) DEFAULT 'default-avatar.png'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `branches` (`branch_code`, `branch_name`, `profile_img`)
VALUES ('comsci41', 'วิทยาการคอมพิวเตอร์ รุ่น 41', 'comsci41.png');

CREATE TABLE `members` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `branch`        VARCHAR(100) NOT NULL DEFAULT 'comsci41',
    `name`          VARCHAR(255) NOT NULL,
    `amount`        DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    `paid_months`   JSON NOT NULL,
    `paid_weeks`    JSON NOT NULL,
    `history`       JSON NOT NULL,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`branch`) REFERENCES `branches`(`branch_code`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
    `key`           VARCHAR(64) PRIMARY KEY,
    `value`         VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `settings` (`key`, `value`) VALUES ('target_amount', '4000') AS new_data
    ON DUPLICATE KEY UPDATE `value` = new_data. `value`;

-- INSERT INTO `members` 
--   (`id`, `branch`, `name`, `amount`, `paid_months`, `paid_weeks`, `history`, `updated_at`)  
-- VALUES 
--   (1, 'comsci41', 'สุพรรณณิกา คงคาศรี', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:08:13'),
--   (2, 'comsci41', 'แพรวา ปั่นด้วง', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:08:21'),
--   (3, 'comsci41', 'วรกมล รู้เจน', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:08:28'),
--   (4, 'comsci41', 'เกศรินทร์ พวงมณี', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:08:50'),
--   (5, 'comsci41', 'พีรพัฒน์ เเสงมุณี', 100.00, '[false, false, false, false, false, false, false, false, true, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[{"date": "27/8/2569", "mode": "month", "items": [8], "amount": 100, "method": "PromptPay", "slipUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4SZGRXhpZgAATU0AKgAAAAgABgESAAMAAAABAAEAAAEaAAUAAAABAAAAVgEbAAUAAAABAAAAXgEoAAMAAAABAAIAAAITAAMAAAA..."}]', '2026-08-27 02:42:13'),
--   (6, 'comsci41', 'ขวัญชนก วงศ์มหาเจิม', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:09:05'),
--   (7, 'comsci41', 'กวินธิดา เเสนคำ', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:43:39'),
--   (8, 'comsci41', 'พิมพ์นารา จิระพรพงศ์', 100.00, '[false, false, false, false, false, false, false, false, true, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[{"date": "25/8/2569", "mode": "month", "items": [8], "amount": 100, "method": "PromptPay", "slipUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAA..."}]', '2026-08-25 07:44:01'),
--   (9, 'comsci41', 'วาฤทธิ์ พิกาพวง', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:44:16'),
--   (10, 'comsci41', 'กัญญาภัค จงเเจ่ม', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:44:32'),
--   (11, 'comsci41', 'เนตรอัปสร ปรีกาล', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:44:55'),
--   (12, 'comsci41', 'พิณญาดา ทิพย์คำเพย', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:45:18');
--   (13, 'comsci41', 'สิลลิดา แย้มพงษ์', 100.00, '[false, false, false, false, false, false, false, false, false, false, false, false]', '[false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]', '[]', '2026-08-25 07:45:25');

-- คำสั่งสร้างตาราง admins
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `branch` VARCHAR(100) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- คำสั่งเพิ่มข้อมูลตัวอย่างตามภาพ
INSERT INTO `admins` (`id`, `student_id`, `name`, `branch`, `created_at`) 
VALUES (9, '6821207004', 'สมชาย', 'COM', '2026-08-28 11:07:29');

-- เพิ่มคอลัมน์ที่ขาดในตาราง members
ALTER TABLE `members` 
ADD COLUMN `student_id` VARCHAR(50) AFTER `id`,
ADD COLUMN `profile_img` VARCHAR(255) DEFAULT NULL AFTER `history`;

-- เพิ่มตารางสำหรับเก็บประวัติสลิปที่ตรวจสอบแล้ว (ใน app.js มีการใช้งาน)
CREATE TABLE IF NOT EXISTS `processed_slips` (
    `trans_ref` VARCHAR(100) PRIMARY KEY,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
);