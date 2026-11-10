-- 本機用：讓應用程式帳號可以建立與清除測試資料庫（seat_test、seat_test_a…），以及 Prisma migrate dev 的 shadow database。
-- 只在第一次建立 MySQL volume 時執行。
GRANT ALL PRIVILEGES ON *.* TO 'seat'@'%';
FLUSH PRIVILEGES;
