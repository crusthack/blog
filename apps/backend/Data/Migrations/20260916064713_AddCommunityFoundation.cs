using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCommunityFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "Revision",
                table: "Posts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<bool>(
                name: "IsSuspended",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "AuditEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ActorId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Action = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Target = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CommunityInvites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UsedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunityInvites", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ContentReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PostId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ReporterId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CommentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Reason = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResolvedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Resolution = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentReports_Posts_PostId",
                        column: x => x.PostId,
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PostBookmarks",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PostId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostBookmarks", x => new { x.UserId, x.PostId });
                    table.ForeignKey(
                        name: "FK_PostBookmarks_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PostBookmarks_Posts_PostId",
                        column: x => x.PostId,
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PostComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PostId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AuthorId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ParentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Content = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    Revision = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PostComments_AspNetUsers_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PostComments_PostComments_ParentId",
                        column: x => x.ParentId,
                        principalTable: "PostComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PostComments_Posts_PostId",
                        column: x => x.PostId,
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Posts_DeletedAtUtc_CategoryId_PostNumber",
                table: "Posts",
                columns: new[] { "DeletedAtUtc", "CategoryId", "PostNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEvents_CreatedAtUtc",
                table: "AuditEvents",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityInvites_TokenHash",
                table: "CommunityInvites",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContentReports_PostId",
                table: "ContentReports",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_ContentReports_ResolvedAtUtc_CreatedAtUtc",
                table: "ContentReports",
                columns: new[] { "ResolvedAtUtc", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PostBookmarks_PostId",
                table: "PostBookmarks",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_PostComments_AuthorId",
                table: "PostComments",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_PostComments_ParentId",
                table: "PostComments",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_PostComments_PostId_CreatedAtUtc_Id",
                table: "PostComments",
                columns: new[] { "PostId", "CreatedAtUtc", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditEvents");

            migrationBuilder.DropTable(
                name: "CommunityInvites");

            migrationBuilder.DropTable(
                name: "ContentReports");

            migrationBuilder.DropTable(
                name: "PostBookmarks");

            migrationBuilder.DropTable(
                name: "PostComments");

            migrationBuilder.DropIndex(
                name: "IX_Posts_DeletedAtUtc_CategoryId_PostNumber",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "Revision",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "IsSuspended",
                table: "AspNetUsers");
        }
    }
}
