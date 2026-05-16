import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a full inventory report as an Excel workbook with multiple sheets:
   * Products, Categories, Stock, Orders, Order Items, Staff, and Stock Transactions.
   */
  async generateFullReport(): Promise<ExcelJS.Workbook> {
    const [products, categories, stock, orders, orderItems, users, transactions] =
      await Promise.all([
        this.prisma.products.findMany({
          include: { categories: true, stock: true },
          orderBy: { productname: 'asc' },
        }),
        this.prisma.categories.findMany({ orderBy: { categoryname: 'asc' } }),
        this.prisma.stock.findMany({
          include: { products: { select: { productname: true } } },
          orderBy: { stockid: 'asc' },
        }),
        this.prisma.orders.findMany({
          include: {
            users: { select: { fullname: true } },
            invoices: true,
          },
          orderBy: { orderdate: 'desc' },
        }),
        this.prisma.orderitems.findMany({
          include: {
            products: { select: { productname: true } },
            orders: { select: { customername: true, orderdate: true } },
          },
        }),
        this.prisma.users.findMany({
          select: {
            userid: true,
            fullname: true,
            email: true,
            role: true,
            isactive: true,
            createdat: true,
          },
          orderBy: { fullname: 'asc' },
        }),
        this.prisma.stocktransactions.findMany({
          include: {
            products: { select: { productname: true } },
            users: { select: { fullname: true } },
          },
          orderBy: { createdat: 'desc' },
          take: 500,
        }),
      ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'StockSense IMS';
    workbook.created = new Date();

    // ── Common styles ─────────────────────────────────────────────────
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    const headerFont: Partial<ExcelJS.Font> = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
    };
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };

    const styleSheet = (sheet: ExcelJS.Worksheet) => {
      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = borderStyle;
      });
      headerRow.height = 28;

      // Style data rows
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        row.eachCell((cell) => {
          cell.border = borderStyle;
          cell.alignment = { vertical: 'middle', wrapText: true };
        });
        // Alternate row color
        if (i % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' },
            };
          });
        }
      }

      // Auto-fit columns (approximate)
      sheet.columns.forEach((col) => {
        let maxLength = 12;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const cellLength = cell.value ? String(cell.value).length : 0;
          if (cellLength > maxLength) maxLength = cellLength;
        });
        col.width = Math.min(maxLength + 4, 40);
      });
    };

    // ── 1. Products Sheet ─────────────────────────────────────────────
    const productsSheet = workbook.addWorksheet('Products');
    productsSheet.columns = [
      { header: 'Product Name', key: 'name' },
      { header: 'Category', key: 'category' },
      { header: 'Description', key: 'description' },
      { header: 'Price (₹)', key: 'price' },
      { header: 'Cost Price (₹)', key: 'costprice' },
      { header: 'Barcode', key: 'barcode' },
      { header: 'Stock Qty', key: 'stock' },
      { header: 'Low Threshold', key: 'threshold' },
      { header: 'Active', key: 'active' },
      { header: 'Created At', key: 'createdat' },
    ];
    products.forEach((p) => {
      productsSheet.addRow({
        name: p.productname,
        category: p.categories?.categoryname || 'N/A',
        description: p.description || '',
        price: Number(p.price),
        costprice: p.costprice ? Number(p.costprice) : '',
        barcode: p.barcode || '',
        stock: p.stock?.quantity ?? 0,
        threshold: p.stock?.lowstockthreshold ?? 5,
        active: p.isactive ? 'Yes' : 'No',
        createdat: p.createdat
          ? new Date(p.createdat).toLocaleDateString()
          : '',
      });
    });
    styleSheet(productsSheet);

    // ── 2. Categories Sheet ───────────────────────────────────────────
    const categoriesSheet = workbook.addWorksheet('Categories');
    categoriesSheet.columns = [
      { header: 'ID', key: 'id' },
      { header: 'Category Name', key: 'name' },
    ];
    categories.forEach((c) => {
      categoriesSheet.addRow({
        id: c.categoryid,
        name: c.categoryname,
      });
    });
    styleSheet(categoriesSheet);

    // ── 3. Stock Overview Sheet ───────────────────────────────────────
    const stockSheet = workbook.addWorksheet('Stock');
    stockSheet.columns = [
      { header: 'Product', key: 'product' },
      { header: 'Quantity', key: 'quantity' },
      { header: 'Low Stock Threshold', key: 'threshold' },
      { header: 'Status', key: 'status' },
      { header: 'Last Updated', key: 'updatedat' },
    ];
    stock.forEach((s) => {
      const isLow = s.quantity <= (s.lowstockthreshold ?? 5);
      stockSheet.addRow({
        product: s.products?.productname || 'Unknown',
        quantity: s.quantity,
        threshold: s.lowstockthreshold ?? 5,
        status: isLow ? '⚠ LOW STOCK' : 'Healthy',
        updatedat: s.updatedat
          ? new Date(s.updatedat).toLocaleDateString()
          : '',
      });
    });
    styleSheet(stockSheet);
    // Conditional formatting: highlight low-stock rows
    for (let i = 2; i <= stockSheet.rowCount; i++) {
      const statusCell = stockSheet.getRow(i).getCell('status');
      if (String(statusCell.value).includes('LOW')) {
        stockSheet.getRow(i).eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEF2F2' },
          };
          cell.font = { color: { argb: 'FFDC2626' } };
        });
      }
    }

    // ── 4. Orders Sheet ───────────────────────────────────────────────
    const ordersSheet = workbook.addWorksheet('Orders');
    ordersSheet.columns = [
      { header: 'Order Date', key: 'date' },
      { header: 'Customer', key: 'customer' },
      { header: 'Total Amount (₹)', key: 'total' },
      { header: 'Status', key: 'status' },
      { header: 'Invoice #', key: 'invoice' },
      { header: 'Created By', key: 'createdby' },
      { header: 'Delivered At', key: 'deliveredat' },
      { header: 'Cancelled At', key: 'cancelledat' },
    ];
    orders.forEach((o) => {
      ordersSheet.addRow({
        date: o.orderdate
          ? new Date(o.orderdate).toLocaleString()
          : '',
        customer: o.customername || 'N/A',
        total: Number(o.totalamount),
        status: o.status,
        invoice: o.invoices?.invoicenumber || '',
        createdby: o.users?.fullname || 'System',
        deliveredat: o.deliveredat
          ? new Date(o.deliveredat).toLocaleString()
          : '',
        cancelledat: o.cancelledat
          ? new Date(o.cancelledat).toLocaleString()
          : '',
      });
    });
    styleSheet(ordersSheet);

    // ── 5. Order Items Sheet ──────────────────────────────────────────
    const orderItemsSheet = workbook.addWorksheet('Order Items');
    orderItemsSheet.columns = [
      { header: 'Order Date', key: 'orderdate' },
      { header: 'Customer', key: 'customer' },
      { header: 'Product', key: 'product' },
      { header: 'Quantity', key: 'quantity' },
      { header: 'Unit Price (₹)', key: 'unitprice' },
      { header: 'Total Price (₹)', key: 'totalprice' },
    ];
    orderItems.forEach((item) => {
      orderItemsSheet.addRow({
        orderdate: item.orders?.orderdate
          ? new Date(item.orders.orderdate).toLocaleString()
          : '',
        customer: item.orders?.customername || 'N/A',
        product: item.products?.productname || 'Unknown',
        quantity: item.quantity,
        unitprice: Number(item.unitprice),
        totalprice: Number(item.totalprice),
      });
    });
    styleSheet(orderItemsSheet);

    // ── 6. Staff Sheet ────────────────────────────────────────────────
    const staffSheet = workbook.addWorksheet('Staff');
    staffSheet.columns = [
      { header: 'Full Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Role', key: 'role' },
      { header: 'Active', key: 'active' },
      { header: 'Joined', key: 'createdat' },
    ];
    users.forEach((u) => {
      staffSheet.addRow({
        name: u.fullname,
        email: u.email,
        role: u.role,
        active: u.isactive ? 'Yes' : 'No',
        createdat: u.createdat
          ? new Date(u.createdat).toLocaleDateString()
          : '',
      });
    });
    styleSheet(staffSheet);

    // ── 7. Stock Transactions Sheet ───────────────────────────────────
    const txSheet = workbook.addWorksheet('Stock Transactions');
    txSheet.columns = [
      { header: 'Date', key: 'date' },
      { header: 'Product', key: 'product' },
      { header: 'Type', key: 'type' },
      { header: 'Quantity', key: 'quantity' },
      { header: 'Previous Qty', key: 'prev' },
      { header: 'New Qty', key: 'newqty' },
      { header: 'Notes', key: 'notes' },
      { header: 'Done By', key: 'user' },
    ];
    transactions.forEach((tx) => {
      txSheet.addRow({
        date: tx.createdat
          ? new Date(tx.createdat).toLocaleString()
          : '',
        product: tx.products?.productname || 'Unknown',
        type: tx.transactiontype,
        quantity: tx.quantity,
        prev: tx.previousquantity,
        newqty: tx.newquantity,
        notes: tx.notes || '',
        user: tx.users?.fullname || 'System',
      });
    });
    styleSheet(txSheet);

    return workbook;
  }
}
