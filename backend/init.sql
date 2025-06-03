-- backend/init.sql
-- This script will be automatically run by the PostgreSQL container when it first starts up.
-- It creates all the necessary tables for your POS system.

-- Table: users
CREATE TABLE IF NOT EXISTS users ( -- Create the 'users' table if it doesn't already exist.
    user_id SERIAL PRIMARY KEY, -- A unique number for each user, automatically increases.
    username VARCHAR(50) UNIQUE NOT NULL, -- The user's login name, must be unique and not empty.
    password_hash VARCHAR(255) NOT NULL, -- Stores the secure (hashed) version of the user's password.
    full_name VARCHAR(100), -- The user's full name.
    role VARCHAR(50) NOT NULL DEFAULT 'cashier', -- What kind of user they are (e.g., 'admin', 'cashier'). Defaults to 'cashier'.
    is_active BOOLEAN DEFAULT TRUE, -- Is this user account currently active?
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When this user record was created, with timezone info.
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- When this user record was last updated, with timezone info.
);

-- Table: categories
CREATE TABLE IF NOT EXISTS categories ( -- Create a table for menu item categories (e.g., 'Appetizers', 'Drinks').
    category_id SERIAL PRIMARY KEY, -- Unique ID for each category.
    category_name VARCHAR(100) UNIQUE NOT NULL, -- Name of the category, must be unique and not empty.
    description TEXT, -- A longer description for the category.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: menu_items
CREATE TABLE IF NOT EXISTS menu_items ( -- Create a table for individual items on your menu.
    item_id SERIAL PRIMARY KEY, -- Unique ID for each menu item.
    category_id INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT, -- Links to a category; if a category is deleted, items linked to it must be handled first.
    item_name VARCHAR(255) UNIQUE NOT NULL, -- Name of the menu item, must be unique and not empty.
    description TEXT, -- A description of the item.
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0), -- The item's price, stored with 2 decimal places, cannot be negative.
    is_available BOOLEAN DEFAULT TRUE, -- Is this item currently available (not sold out)?
    image_url VARCHAR(255), -- Optional: a link to an image of the item.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: orders
CREATE TABLE IF NOT EXISTS orders ( -- Create a table for customer orders.
    order_id SERIAL PRIMARY KEY, -- Unique ID for each order.
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When the order was placed.
    table_number VARCHAR(20), -- Which table number the order belongs to (can be empty for takeout).
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- Current status of the order (e.g., 'pending', 'completed', 'cancelled').
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- The sum of all items before discounts.
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Total amount of discounts applied to this order.
    final_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- The final amount due after discounts.
    cashier_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL, -- Who took this order; if the user is deleted, this becomes empty.
    notes TEXT, -- Any special notes for the order.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: order_items
CREATE TABLE IF NOT EXISTS order_items ( -- Details about each individual item within an order.
    order_item_id SERIAL PRIMARY KEY, -- Unique ID for each item line in an order.
    order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE, -- Links to the order; if the order is deleted, these items are also deleted.
    item_id INTEGER REFERENCES menu_items(item_id) ON DELETE RESTRICT, -- Links to the menu item.
    item_name VARCHAR(255) NOT NULL, -- The name of the item at the time of order (useful if menu item names change later).
    quantity INTEGER NOT NULL CHECK (quantity > 0), -- How many of this item were ordered, must be at least 1.
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0), -- The price of the item at the time of order.
    item_total DECIMAL(10, 2) NOT NULL, -- Calculated: quantity * unit_price.
    notes TEXT, -- Specific notes for this item (e.g., "no pickles").
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: payments
CREATE TABLE IF NOT EXISTS payments ( -- Records all payment transactions.
    payment_id SERIAL PRIMARY KEY, -- Unique ID for each payment.
    order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE, -- Links to the order this payment is for.
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When the payment was made.
    payment_method VARCHAR(50) NOT NULL, -- How the payment was made (e.g., 'cash', 'card').
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0), -- The amount paid, must be positive.
    transaction_id VARCHAR(100), -- An ID from a card reader or online payment system.
    cashier_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL, -- Who processed this payment.
    notes TEXT, -- Any notes about the payment.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: discounts
CREATE TABLE IF NOT EXISTS discounts ( -- Stores different types of discounts available.
    discount_id SERIAL PRIMARY KEY, -- Unique ID for each discount type.
    discount_name VARCHAR(100) UNIQUE NOT NULL, -- Name of the discount (e.g., 'Student Discount').
    discount_type VARCHAR(20) NOT NULL, -- Whether it's a 'percentage' or 'fixed_amount' discount.
    value DECIMAL(5, 2) NOT NULL CHECK (value >= 0), -- The percentage (e.g., 5 for 5%) or fixed amount (e.g., 10.00).
    is_active BOOLEAN DEFAULT TRUE, -- Is this discount currently usable?
    applies_to VARCHAR(20) DEFAULT 'total_bill', -- Does it apply to the 'total_bill' or an 'item'?
    min_amount_threshold DECIMAL(10, 2), -- Optional: minimum order amount for the discount to apply.
    valid_from TIMESTAMP WITH TIME ZONE, -- Optional: when the discount becomes active.
    valid_until TIMESTAMP WITH TIME ZONE, -- Optional: when the discount expires.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: order_discounts
CREATE TABLE IF NOT EXISTS order_discounts ( -- Links specific applied discounts to orders.
    order_discount_id SERIAL PRIMARY KEY, -- Unique ID for each applied discount record.
    order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE, -- Which order this discount was applied to.
    discount_id INTEGER NOT NULL REFERENCES discounts(discount_id) ON DELETE RESTRICT, -- Which discount type was applied.
    applied_value DECIMAL(10, 2) NOT NULL, -- The actual monetary value that was discounted on this order.
    applied_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL, -- Who applied this discount.
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: cashier_shifts
CREATE TABLE IF NOT EXISTS cashier_shifts ( -- Tracks cashier work shifts and cash drawer activities.
    shift_id SERIAL PRIMARY KEY, -- Unique ID for each shift.
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT, -- Which user (cashier) this shift belongs to.
    shift_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- When the shift began.
    shift_end TIMESTAMP WITH TIME ZONE, -- When the shift ended (empty if still ongoing).
    opening_cash DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Cash amount in the drawer at the start of the shift.
    closing_cash DECIMAL(10, 2), -- Cash amount in the drawer at the end of the shift.
    cash_in DECIMAL(10, 2) DEFAULT 0.00, -- Any extra cash added to the drawer during the shift.
    cash_out DECIMAL(10, 2) DEFAULT 0.00, -- Any cash removed from the drawer during the shift.
    sales_amount_cash DECIMAL(10, 2) DEFAULT 0.00, -- Total cash payments recorded during this shift.
    sales_amount_card DECIMAL(10, 2) DEFAULT 0.00, -- Total card payments recorded during this shift.
    notes TEXT, -- Any notes about the shift.
    reconciled BOOLEAN DEFAULT FALSE, -- Has this shift's cash been checked and matched?
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Add some initial data for testing
-- These INSERT statements will only run if the data doesn't already exist (ON CONFLICT DO NOTHING).
INSERT INTO users (username, password_hash, full_name, role) VALUES
('admin', 'your_hashed_admin_password_here', 'Admin User', 'admin') ON CONFLICT (username) DO NOTHING;

INSERT INTO categories (category_name, description) VALUES
('Coffee', 'Coffee beverages'),
('Food', 'Breakfast and Lunch items') ON CONFLICT (category_name) DO NOTHING;
