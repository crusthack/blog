using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminDrive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DriveEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ParentId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    NameKey = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    IsFolder = table.Column<bool>(type: "INTEGER", nullable: false),
                    Size = table.Column<long>(type: "INTEGER", nullable: false),
                    Revision = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DriveEntries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DriveEntries_DeletedAtUtc",
                table: "DriveEntries",
                column: "DeletedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_DriveEntries_ParentId_NameKey",
                table: "DriveEntries",
                columns: new[] { "ParentId", "NameKey" },
                unique: true,
                filter: "DeletedAtUtc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DriveEntries");
        }
    }
}
