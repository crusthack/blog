using Microsoft.EntityFrameworkCore.Migrations;
using Blog.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Blog.Api.Data.Migrations;

[DbContext(typeof(BlogDbContext))]
[Migration("20260903000000_AddCategories")]
public partial class AddCategories : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Categories",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "TEXT", nullable: false),
                Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                Slug = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                Description = table.Column<string>(type: "TEXT", maxLength: 300, nullable: true),
                SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                IsVisible = table.Column<bool>(type: "INTEGER", nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_Categories", x => x.Id));

        migrationBuilder.Sql(
            "ALTER TABLE Posts ADD COLUMN CategoryId TEXT NULL REFERENCES Categories(Id) ON DELETE SET NULL;");

        migrationBuilder.CreateIndex(
            name: "IX_Categories_Slug",
            table: "Categories",
            column: "Slug",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_Posts_CategoryId",
            table: "Posts",
            column: "CategoryId");

    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_Posts_CategoryId", table: "Posts");
        migrationBuilder.Sql("ALTER TABLE Posts DROP COLUMN CategoryId;");
        migrationBuilder.DropTable(name: "Categories");
    }
}
