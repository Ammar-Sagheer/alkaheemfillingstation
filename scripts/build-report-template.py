"""
Builds the Excel template used by the monthly report download.

Why a template at all: no JavaScript library can write native Excel charts.
ExcelJS has no chart support whatsoever, and the app runs on Vercel, so Python
cannot run at request time either. So the charts are authored ONCE here, where
openpyxl can write them properly, and committed as a binary template.

At request time the app opens this file as a zip, replaces only the XML of the
data sheets, and zips it back up. The chart parts are never touched, so they
arrive in the downloaded file intact and fully native - clickable, restyleable,
and recalculating if the owner edits the numbers.

The one rule that keeps this working: the charts point at FIXED ranges on the
Daily sheet (rows 2-32, enough for any month). Short months leave blank rows,
which Excel simply skips. Never make a chart range depend on how many rows the
data happens to have.

Run:  python3 scripts/build-report-template.py
Out:  app/_lib/report-template.xlsx
"""

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
import os

BRAND = "047857"        # brand-700, matches the app
PETROL = "0284C7"
DIESEL = "CA8A04"
CASH = "059669"
CREDIT = "7C3AED"       # validated against the app's palette for CVD safety
INK = "0F172A"

HEADER_FILL = PatternFill("solid", fgColor=INK)
HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=10)
LABEL_FONT = Font(name="Arial", bold=True, size=10)
BODY_FONT = Font(name="Arial", size=10)
TITLE_FONT = Font(name="Arial", bold=True, size=14, color=BRAND)

MONEY = '"Rs "#,##0'
LITRES = '#,##0.00" L"'
# Dates are written as real Excel serial numbers, not text, so the chart's
# category axis reads them as dates and the columns sort properly.
DATE_FMT = 'dd mmm yyyy'

DAILY_ROWS = 31  # a month never has more; short months just leave blanks


def style_header(ws, row, headers, widths):
    for index, (title, width) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=row, column=index, value=title)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(index)].width = width
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def prototype_row(ws, row, formats):
    """
    Lays down one styled but empty row.

    The app reads this row's style ids when it writes real data, so number
    formats survive without anything having to re-derive style indexes from
    styles.xml. `formats` maps a 1-based column to a number format, or None for
    plain text.
    """
    for index, number_format in enumerate(formats, start=1):
        cell = ws.cell(row=row, column=index)
        cell.font = BODY_FONT
        if number_format:
            cell.number_format = number_format


def build():
    wb = Workbook()

    # ---------------------------------------------------------------- Summary
    summary = wb.active
    summary.title = "Summary"
    summary.sheet_view.showGridLines = False
    summary.column_dimensions["A"].width = 34
    summary.column_dimensions["B"].width = 22
    summary.column_dimensions["C"].width = 20

    summary["A1"] = "Monthly Report"
    summary["A1"].font = TITLE_FONT

    # Placeholder labels. The app rewrites this sheet's values wholesale, but
    # keeping the shape here documents what it will contain.
    rows = [
        ("Pump", ""),
        ("Period", ""),
        ("Generated", ""),
        ("", ""),
        ("SALES", ""),
        ("Litres sold", 0),
        ("Sales", 0),
        ("Cash taken", 0),
        ("Given on credit", 0),
        ("", ""),
        ("LUBRICANTS", ""),
        ("Litres sold", 0),
        ("Sales", 0),
        ("Cash taken", 0),
        ("Given on credit", 0),
        ("", ""),
        ("COSTS", ""),
        ("Fuel bought (litres)", 0),
        ("Fuel bought (cost)", 0),
        ("Lubricants bought (cost)", 0),
        ("Still owed to suppliers", 0),
        ("Expenses", 0),
        ("", ""),
        ("PROFIT", 0),
        ("", ""),
        ("CLOSING STOCK", ""),
    ]
    for offset, (label, value) in enumerate(rows, start=3):
        summary.cell(row=offset, column=1, value=label).font = LABEL_FONT
        cell = summary.cell(row=offset, column=2, value=value)
        cell.font = BODY_FONT

    # ------------------------------------------------------------------ Daily
    #
    # The two lubricant columns go on the END, after the columns the charts
    # read. The charts point at fixed ranges by column number (E for sales, F:G
    # for the cash/credit split, C:D for the fuel split), so anything inserted
    # among those would silently repoint them at the wrong figures.
    daily = wb.create_sheet("Daily")
    style_header(
        daily,
        1,
        ["Date", "Litres sold", "Petrol (L)", "Diesel (L)", "Sales", "Cash", "Credit",
         "Lubricant (L)", "Lubricant sales"],
        [14, 14, 14, 14, 16, 16, 16, 15, 17],
    )
    for row in range(2, DAILY_ROWS + 2):
        date_cell = daily.cell(row=row, column=1)
        date_cell.font = BODY_FONT
        date_cell.number_format = DATE_FMT
        for column in range(2, 10):
            cell = daily.cell(row=row, column=column)
            cell.font = BODY_FONT
            cell.number_format = LITRES if column in (2, 3, 4, 8) else MONEY

    # ----------------------------------------------------------------- Charts
    # Own sheet, and the ONLY sheet the app must never rewrite - it carries the
    # drawing relationship that anchors the charts.
    charts = wb.create_sheet("Charts")
    charts.sheet_view.showGridLines = False
    charts["A1"] = "Charts update automatically from the Daily sheet"
    charts["A1"].font = TITLE_FONT

    dates = Reference(daily, min_col=1, min_row=2, max_row=DAILY_ROWS + 1)

    sales_chart = BarChart()
    sales_chart.type = "col"
    sales_chart.title = "Daily sales"
    sales_chart.y_axis.title = "Rupees"
    sales_chart.x_axis.title = "Date"
    sales_chart.height = 9
    sales_chart.width = 24
    sales_chart.gapWidth = 40
    sales_data = Reference(daily, min_col=5, min_row=1, max_row=DAILY_ROWS + 1)
    sales_chart.add_data(sales_data, titles_from_data=True)
    sales_chart.set_categories(dates)
    sales_chart.series[0].graphicalProperties.solidFill = BRAND
    sales_chart.series[0].graphicalProperties.line.noFill = True
    charts.add_chart(sales_chart, "A3")

    split_chart = BarChart()
    split_chart.type = "col"
    split_chart.grouping = "stacked"
    split_chart.overlap = 100          # required, or stacked bars render side by side
    split_chart.title = "Cash vs credit"
    split_chart.y_axis.title = "Rupees"
    split_chart.x_axis.title = "Date"
    split_chart.height = 9
    split_chart.width = 24
    split_chart.gapWidth = 40
    split_data = Reference(daily, min_col=6, max_col=7, min_row=1, max_row=DAILY_ROWS + 1)
    split_chart.add_data(split_data, titles_from_data=True)
    split_chart.set_categories(dates)
    split_chart.series[0].graphicalProperties.solidFill = CASH
    split_chart.series[0].graphicalProperties.line.noFill = True
    split_chart.series[1].graphicalProperties.solidFill = CREDIT
    split_chart.series[1].graphicalProperties.line.noFill = True
    charts.add_chart(split_chart, "A22")

    fuel_chart = BarChart()
    fuel_chart.type = "col"
    fuel_chart.grouping = "stacked"
    fuel_chart.overlap = 100
    fuel_chart.title = "Litres by fuel type"
    fuel_chart.y_axis.title = "Litres"
    fuel_chart.x_axis.title = "Date"
    fuel_chart.height = 9
    fuel_chart.width = 24
    fuel_chart.gapWidth = 40
    fuel_data = Reference(daily, min_col=3, max_col=4, min_row=1, max_row=DAILY_ROWS + 1)
    fuel_chart.add_data(fuel_data, titles_from_data=True)
    fuel_chart.set_categories(dates)
    fuel_chart.series[0].graphicalProperties.solidFill = PETROL
    fuel_chart.series[0].graphicalProperties.line.noFill = True
    fuel_chart.series[1].graphicalProperties.solidFill = DIESEL
    fuel_chart.series[1].graphicalProperties.line.noFill = True
    charts.add_chart(fuel_chart, "A41")

    # -------------------------------------------------------- detail listings
    purchases = wb.create_sheet("Purchases")
    style_header(
        purchases,
        1,
        ["Date", "Tank", "Fuel", "Supplier", "Invoice", "Litres", "Rate", "Cost", "Payment"],
        [14, 16, 12, 22, 16, 14, 12, 18, 12],
    )

    prototype_row(purchases, 2, [DATE_FMT, None, None, None, None, LITRES, MONEY, MONEY, None])

    expenses = wb.create_sheet("Expenses")
    style_header(expenses, 1, ["Date", "Category", "Note", "Amount"], [14, 20, 40, 18])
    prototype_row(expenses, 2, [DATE_FMT, None, None, MONEY])

    customers = wb.create_sheet("Customers")
    style_header(
        customers,
        1,
        ["Customer", "Vehicle", "Credit limit", "Owes"],
        [30, 18, 18, 18],
    )

    prototype_row(customers, 2, [None, None, MONEY, MONEY])

    readings = wb.create_sheet("Readings")
    style_header(
        readings,
        1,
        ["Date", "Unit", "Nozzle", "Fuel", "Opening", "Closing", "Litres", "Rate", "Sales", "Cash", "Credit"],
        [14, 8, 10, 12, 14, 14, 14, 12, 16, 16, 16],
    )
    prototype_row(readings, 2,
                  [DATE_FMT, None, None, None, LITRES, LITRES, LITRES, MONEY, MONEY, MONEY, MONEY])

    # Bank goes LAST, and new sheets always should. The app addresses sheets by
    # their file name (sheet1.xml, sheet2.xml ...), which openpyxl assigns in
    # creation order - so inserting one anywhere else silently renumbers every
    # sheet after it and the app starts rewriting the wrong ones.
    #
    # In and Out are separate columns rather than one signed amount: the owner
    # reads this in Excel, and a column of positives he has to check the sign of
    # is how a payment gets read as a deposit.
    bank = wb.create_sheet("Bank")
    style_header(
        bank,
        1,
        ["Date", "Account", "Bank", "In", "Out", "What for", "Note"],
        [14, 22, 22, 16, 16, 22, 34],
    )
    prototype_row(bank, 2, [DATE_FMT, None, None, MONEY, MONEY, None, None])

    # Lubricants goes after Bank, for the reason given above it: new sheets
    # always go last, or every sheet after the insertion point is renumbered and
    # the app starts rewriting the wrong ones.
    #
    # Every counter sale in the month, one row each - a 4 litre carton and a
    # quarter litre poured loose look the same here, because they are the same
    # stock measured the same way.
    lubricants = wb.create_sheet("Lubricants")
    style_header(
        lubricants,
        1,
        ["Date", "Lubricant", "Litres", "Rate", "Amount", "Cash", "Credit", "Customer", "Note"],
        [14, 30, 12, 14, 16, 16, 16, 24, 30],
    )
    prototype_row(lubricants, 2,
                  [DATE_FMT, None, LITRES, MONEY, MONEY, MONEY, MONEY, None, None])

    # Assets goes after Lubricants for the reason given above it: a new sheet
    # always goes LAST, or every sheet after the insertion point is renumbered
    # and excel-report.js starts rewriting the wrong ones.
    #
    # The WHOLE register, not just what was bought this month - an asset
    # register answers "what does the business own", and most months the pump
    # buys nothing, so a month-scoped sheet would be empty and read as a bug.
    # "Bought this month" is a column instead, so the sheet can be filtered
    # down to the month when that is the question.
    assets = wb.create_sheet("Assets")
    style_header(
        assets,
        1,
        ["Date", "Asset", "Category", "Value", "Bought this month", "Note"],
        [14, 30, 18, 18, 20, 34],
    )
    prototype_row(assets, 2, [DATE_FMT, None, None, MONEY, None, None])

    out = os.path.join("app", "_lib", "report-template.xlsx")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    wb.save(out)
    print(f"wrote {out}")
    print("sheets:", wb.sheetnames)


if __name__ == "__main__":
    build()
