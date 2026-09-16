using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPostPriority : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Priority",
                table: "Posts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Posts_DeletedAtUtc_Priority_PostNumber",
                table: "Posts",
                columns: new[] { "DeletedAtUtc", "Priority", "PostNumber" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Posts_DeletedAtUtc_Priority_PostNumber",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "Priority",
                table: "Posts");
        }
    }
}
