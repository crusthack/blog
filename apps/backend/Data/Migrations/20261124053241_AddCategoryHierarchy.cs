using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCategoryHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsLocallyVisible",
                table: "Categories",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql("UPDATE Categories SET IsLocallyVisible = IsVisible");

            // SQLite can add a nullable foreign key directly without rebuilding Categories.
            migrationBuilder.Sql("""
                ALTER TABLE "Categories" ADD COLUMN "ParentId" TEXT NULL
                    CONSTRAINT "FK_Categories_Categories_ParentId"
                    REFERENCES "Categories" ("Id") ON DELETE RESTRICT
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Categories_ParentId",
                table: "Categories",
                column: "ParentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Categories_Categories_ParentId",
                table: "Categories");

            migrationBuilder.DropIndex(
                name: "IX_Categories_ParentId",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "IsLocallyVisible",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "Categories");
        }
    }
}
