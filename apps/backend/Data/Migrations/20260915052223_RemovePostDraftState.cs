using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemovePostDraftState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Existing posts become published when this migration is applied.
            migrationBuilder.Sql(
                "UPDATE Posts SET PublishedAtUtc = CURRENT_TIMESTAMP WHERE PublishedAtUtc IS NULL;");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Posts");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Posts",
                type: "TEXT",
                maxLength: 16,
                nullable: false,
                defaultValue: "Published");
        }
    }
}
